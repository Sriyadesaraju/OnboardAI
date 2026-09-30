import { Router } from "express";
import rateLimit from "express-rate-limit";
import { UserRole, TaskStatus, AttendanceStatus, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { authenticate, requireRole } from "../middleware/auth";
import { getSupervisedTraineeIds } from "../lib/scope";

const router = Router();

// Tighter limit here: these are the endpoints Copilot Studio calls on every
// natural-language "summary"/"risk" question, not just direct human traffic.
const aiEndpointRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(authenticate);
router.use(requireRole(UserRole.MANAGER, UserRole.SPOC, UserRole.ADMIN));
router.use(aiEndpointRateLimit);

router.get("/weekly-summary", async (req, res) => {
  const now = new Date();

  // A SPOC's summary covers only the trainees they supervise.
  let taskScope: Prisma.TaskWhereInput = {};
  let attendanceScope: Prisma.AttendanceWhereInput = {};
  if (req.user!.role === UserRole.SPOC) {
    const ids = await getSupervisedTraineeIds(req.user!);
    taskScope = { traineeId: { in: ids } };
    attendanceScope = { traineeId: { in: ids } };
  }

  const [totalTasks, completedTasks, overdueCount, totalAttendance, presentAttendance] = await Promise.all([
    prisma.task.count({ where: taskScope }),
    prisma.task.count({ where: { ...taskScope, status: TaskStatus.COMPLETED } }),
    prisma.task.count({
      where: { ...taskScope, dueDate: { lt: now }, status: { not: TaskStatus.COMPLETED } },
    }),
    prisma.attendance.count({ where: attendanceScope }),
    prisma.attendance.count({ where: { ...attendanceScope, status: AttendanceStatus.PRESENT } }),
  ]);

  const completionRate = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 1000) / 10;
  const attendanceRate =
    totalAttendance === 0 ? 0 : Math.round((presentAttendance / totalAttendance) * 1000) / 10;

  res.json({
    generatedAt: now.toISOString(),
    completionRatePercent: completionRate,
    overdueTaskCount: overdueCount,
    attendanceRatePercent: attendanceRate,
    totalTasks,
    totalAttendanceRecords: totalAttendance,
  });
});

const OVERDUE_THRESHOLD = 2;
const ATTENDANCE_THRESHOLD_PERCENT = 80;

router.get("/risk-flags", async (req, res) => {
  const now = new Date();
  // A SPOC's risk view covers only the trainees they supervise.
  const where =
    req.user!.role === UserRole.SPOC
      ? { id: { in: await getSupervisedTraineeIds(req.user!) } }
      : {};
  const trainees = await prisma.trainee.findMany({
    where,
    include: {
      tasks: true,
      attendance: true,
    },
  });

  const flagged = trainees
    .map((trainee) => {
      const overdueTasks = trainee.tasks.filter(
        (t) => t.dueDate < now && t.status !== TaskStatus.COMPLETED
      ).length;
      const totalAttendance = trainee.attendance.length;
      const presentCount = trainee.attendance.filter((a) => a.status === AttendanceStatus.PRESENT).length;
      const attendanceRate = totalAttendance === 0 ? 100 : (presentCount / totalAttendance) * 100;

      const reasons: string[] = [];
      if (overdueTasks >= OVERDUE_THRESHOLD) reasons.push(`${overdueTasks} overdue tasks`);
      if (attendanceRate < ATTENDANCE_THRESHOLD_PERCENT) {
        reasons.push(`attendance at ${Math.round(attendanceRate * 10) / 10}%`);
      }

      return {
        traineeId: trainee.id,
        traineeNumericId: trainee.traineeId,
        name: trainee.name,
        batch: trainee.batch,
        spoc: trainee.spoc,
        overdueTaskCount: overdueTasks,
        attendanceRatePercent: Math.round(attendanceRate * 10) / 10,
        reasons,
      };
    })
    .filter((row) => row.reasons.length > 0);

  res.json(flagged);
});

export default router;
