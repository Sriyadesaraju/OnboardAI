import { Router } from "express";
import { z } from "zod";
import { UserRole, TraineeStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { authenticate, requireRole } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { getSupervisedName } from "../lib/scope";

const router = Router();

router.use(authenticate);

// Can the current user view this specific trainee's record?
// Manager/Admin -> anyone; a trainee/SPOC -> themselves; a SPOC -> their group.
async function canViewTrainee(
  user: NonNullable<import("express").Request["user"]>,
  trainee: { id: string; spoc: string | null }
): Promise<boolean> {
  if (user.role === UserRole.MANAGER || user.role === UserRole.ADMIN) return true;
  if (user.traineeId === trainee.id) return true;
  if (user.role === UserRole.SPOC) return trainee.spoc === (await getSupervisedName(user));
  return false;
}

router.get("/", requireRole(UserRole.MANAGER, UserRole.SPOC, UserRole.ADMIN), async (req, res) => {
  // A SPOC only sees the trainees they supervise; Manager/Admin see everyone.
  const where =
    req.user!.role === UserRole.SPOC ? { spoc: (await getSupervisedName(req.user!)) ?? "__none__" } : {};
  const trainees = await prisma.trainee.findMany({ where, orderBy: { traineeId: "asc" } });
  res.json(trainees);
});

router.get("/:id", async (req, res) => {
  const trainee = await prisma.trainee.findUnique({ where: { id: req.params.id } });
  if (!trainee) {
    return res.status(404).json({ error: "NotFound", message: "Trainee not found" });
  }
  if (!(await canViewTrainee(req.user!, trainee))) {
    return res.status(403).json({ error: "Forbidden", message: "Insufficient role" });
  }
  res.json(trainee);
});

// Full drill-down: the trainee plus all of their tasks and attendance.
router.get("/:id/detail", async (req, res) => {
  const trainee = await prisma.trainee.findUnique({
    where: { id: req.params.id },
    include: {
      tasks: { orderBy: { dueDate: "asc" } },
      attendance: { orderBy: { date: "desc" } },
    },
  });
  if (!trainee) {
    return res.status(404).json({ error: "NotFound", message: "Trainee not found" });
  }
  if (!(await canViewTrainee(req.user!, trainee))) {
    return res.status(403).json({ error: "Forbidden", message: "Insufficient role" });
  }
  res.json(trainee);
});

const createTraineeSchema = z.object({
  traineeId: z.number().int().positive(),
  name: z.string().min(1),
  email: z.string().email(),
  spoc: z.string().optional(),
  batch: z.string().min(1),
  status: z.nativeEnum(TraineeStatus).optional(),
});

router.post(
  "/",
  requireRole(UserRole.MANAGER, UserRole.ADMIN),
  validate(createTraineeSchema),
  async (req, res) => {
    const data = req.body as z.infer<typeof createTraineeSchema>;
    const trainee = await prisma.trainee.create({ data });
    res.status(201).json(trainee);
  }
);

const updateTraineeSchema = createTraineeSchema.partial();

router.patch(
  "/:id",
  requireRole(UserRole.MANAGER, UserRole.ADMIN),
  validate(updateTraineeSchema),
  async (req, res) => {
    const data = req.body as z.infer<typeof updateTraineeSchema>;
    try {
      const trainee = await prisma.trainee.update({ where: { id: req.params.id }, data });
      res.json(trainee);
    } catch {
      res.status(404).json({ error: "NotFound", message: "Trainee not found" });
    }
  }
);

export default router;
