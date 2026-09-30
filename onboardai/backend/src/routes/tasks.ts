import { Router } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { UserRole, Priority, TaskStatus, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { authenticate, requireRole } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { getSupervisedName } from "../lib/scope";

const router = Router();

// Tighter limit on writes: this is also the endpoint Copilot Studio calls
// after parsing a manager's natural-language task-creation instruction.
const createTaskRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(authenticate);

const listQuerySchema = z.object({
  status: z.nativeEnum(TaskStatus).optional(),
  traineeId: z.string().optional(),
  overdue: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});

router.get(
  "/",
  requireRole(UserRole.MANAGER, UserRole.SPOC, UserRole.ADMIN),
  validate(listQuerySchema, "query"),
  async (req, res) => {
    const { status, traineeId, overdue } = req.query as unknown as z.infer<typeof listQuerySchema>;
    const where: Prisma.TaskWhereInput = {};
    if (status) where.status = status;
    if (traineeId) where.traineeId = traineeId;
    if (overdue) {
      where.dueDate = { lt: new Date() };
      where.status = { not: TaskStatus.COMPLETED };
    }
    // A SPOC only sees tasks belonging to the trainees they supervise.
    if (req.user!.role === UserRole.SPOC) {
      const name = await getSupervisedName(req.user!);
      where.assignedTo = { spoc: name ?? "__none__" };
    }
    const tasks = await prisma.task.findMany({
      where,
      include: { assignedTo: { select: { id: true, name: true, traineeId: true } } },
      orderBy: { dueDate: "asc" },
    });
    res.json(tasks);
  }
);

// A SPOC is also a trainee, so they can list and complete their own tasks.
router.get("/mine", requireRole(UserRole.TRAINEE, UserRole.SPOC), async (req, res) => {
  if (!req.user!.traineeId) {
    return res.status(400).json({ error: "BadRequest", message: "User is not linked to a trainee record" });
  }
  const tasks = await prisma.task.findMany({
    where: { traineeId: req.user!.traineeId },
    orderBy: { dueDate: "asc" },
  });
  res.json(tasks);
});

// Assign to exactly one of: a single trainee, an explicit list, or everyone.
const createTaskSchema = z
  .object({
    taskName: z.string().min(1),
    description: z.string().optional(),
    dueDate: z.coerce.date(),
    priority: z.nativeEnum(Priority).optional(),
    status: z.nativeEnum(TaskStatus).optional(),
    traineeId: z.string().min(1).optional(),
    traineeIds: z.array(z.string().min(1)).nonempty().optional(),
    assignToAll: z.literal(true).optional(),
  })
  .refine(
    (v) => [v.traineeId, v.traineeIds, v.assignToAll].filter((x) => x !== undefined).length === 1,
    { message: "Provide exactly one of traineeId, traineeIds, or assignToAll" }
  );

router.post(
  "/",
  createTaskRateLimit,
  requireRole(UserRole.MANAGER, UserRole.ADMIN, UserRole.SPOC),
  validate(createTaskSchema),
  async (req, res) => {
    const data = req.body as z.infer<typeof createTaskSchema>;

    let targetIds: string[];
    if (data.assignToAll) {
      const all = await prisma.trainee.findMany({ select: { id: true } });
      targetIds = all.map((t) => t.id);
    } else if (data.traineeIds) {
      targetIds = [...new Set(data.traineeIds)];
    } else {
      targetIds = [data.traineeId!];
    }

    if (targetIds.length === 0) {
      return res.status(400).json({ error: "BadRequest", message: "No trainees to assign to" });
    }

    const existing = await prisma.trainee.findMany({
      where: { id: { in: targetIds } },
      select: { id: true },
    });
    if (existing.length !== targetIds.length) {
      return res.status(400).json({ error: "BadRequest", message: "One or more traineeIds do not exist" });
    }

    const createdBy = req.user!.isConnector ? "copilot-connector" : req.user!.email;
    await prisma.task.createMany({
      data: targetIds.map((id) => ({
        taskName: data.taskName,
        description: data.description ?? null,
        traineeId: id,
        dueDate: data.dueDate,
        priority: data.priority ?? Priority.MEDIUM,
        status: data.status ?? TaskStatus.PENDING,
        createdBy,
      })),
    });

    res.status(201).json({ created: targetIds.length });
  }
);

const updateTaskSchema = z.object({
  taskName: z.string().min(1).optional(),
  description: z.string().optional(),
  traineeId: z.string().min(1).optional(),
  dueDate: z.coerce.date().optional(),
  priority: z.nativeEnum(Priority).optional(),
  status: z.nativeEnum(TaskStatus).optional(),
});

router.patch(
  "/:id",
  requireRole(UserRole.MANAGER, UserRole.ADMIN),
  validate(updateTaskSchema),
  async (req, res) => {
    const data = req.body as z.infer<typeof updateTaskSchema>;
    try {
      const task = await prisma.task.update({ where: { id: req.params.id }, data });
      res.json(task);
    } catch {
      res.status(404).json({ error: "NotFound", message: "Task not found" });
    }
  }
);

router.patch("/:id/complete", requireRole(UserRole.TRAINEE, UserRole.SPOC), async (req, res) => {
  const task = await prisma.task.findUnique({ where: { id: req.params.id } });
  if (!task) {
    return res.status(404).json({ error: "NotFound", message: "Task not found" });
  }
  if (task.traineeId !== req.user!.traineeId) {
    return res.status(403).json({ error: "Forbidden", message: "Not your task" });
  }
  const updated = await prisma.task.update({
    where: { id: req.params.id },
    data: { status: TaskStatus.COMPLETED },
  });
  res.json(updated);
});

export default router;
