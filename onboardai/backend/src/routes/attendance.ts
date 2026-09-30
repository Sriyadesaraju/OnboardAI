import { Router } from "express";
import { z } from "zod";
import { UserRole, AttendanceStatus, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { authenticate, requireRole } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { getSupervisedName } from "../lib/scope";

const router = Router();

router.use(authenticate);
router.use(requireRole(UserRole.MANAGER, UserRole.SPOC, UserRole.ADMIN));

const listQuerySchema = z.object({
  traineeId: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

router.get("/", validate(listQuerySchema, "query"), async (req, res) => {
  const { traineeId, from, to } = req.query as unknown as z.infer<typeof listQuerySchema>;
  const where: Prisma.AttendanceWhereInput = {};
  if (traineeId) where.traineeId = traineeId;
  if (from || to) {
    where.date = {};
    if (from) where.date.gte = from;
    if (to) where.date.lte = to;
  }
  // A SPOC only sees attendance for the trainees they supervise.
  if (req.user!.role === UserRole.SPOC) {
    where.trainee = { spoc: (await getSupervisedName(req.user!)) ?? "__none__" };
  }
  const records = await prisma.attendance.findMany({
    where,
    include: { trainee: { select: { id: true, name: true, traineeId: true } } },
    orderBy: { date: "desc" },
  });
  res.json(records);
});

const createAttendanceSchema = z.object({
  traineeId: z.string().min(1),
  date: z.coerce.date(),
  status: z.nativeEnum(AttendanceStatus).optional(),
});

router.post("/", validate(createAttendanceSchema), async (req, res) => {
  const data = req.body as z.infer<typeof createAttendanceSchema>;
  const trainee = await prisma.trainee.findUnique({ where: { id: data.traineeId } });
  if (!trainee) {
    return res.status(400).json({ error: "BadRequest", message: "traineeId does not exist" });
  }
  // A SPOC may only mark attendance for the trainees they supervise.
  if (req.user!.role === UserRole.SPOC && trainee.spoc !== (await getSupervisedName(req.user!))) {
    return res.status(403).json({ error: "Forbidden", message: "Trainee is not in your allocated group" });
  }
  const record = await prisma.attendance.create({
    data: { ...data, createdBy: req.user!.isConnector ? "copilot-connector" : req.user!.email },
  });
  res.status(201).json(record);
});

export default router;
