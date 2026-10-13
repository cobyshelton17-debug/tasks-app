import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireListMember } from "../lib/access.js";
import { badRequest, notFound } from "../lib/errors.js";
import { param } from "../lib/param.js";
import { assertAuth, requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";

export const tasksRouter = Router();

tasksRouter.use(requireAuth);

const isoDate = z
  .string()
  .datetime({ offset: true })
  .or(z.string().datetime())
  .transform((s) => new Date(s));

const taskFields = {
  title: z.string().trim().min(1, "Title is required").max(500),
  description: z.string().trim().max(5000).nullable().optional(),
  status: z.enum(["TODO", "IN_PROGRESS", "DONE"]).optional(),
  dueDate: isoDate.nullable().optional(),
  assigneeId: z.string().nullable().optional(),
};

const createTaskSchema = z.object({
  ...taskFields,
  title: taskFields.title,
});

const updateTaskSchema = z
  .object({
    title: taskFields.title.optional(),
    description: taskFields.description,
    status: taskFields.status,
    dueDate: taskFields.dueDate,
    assigneeId: taskFields.assigneeId,
    position: z.number().int().min(0).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

const reorderSchema = z.object({ order: z.array(z.string().min(1)).min(1) });

const taskInclude = {
  createdBy: { select: { id: true, name: true, email: true } },
  assignee: { select: { id: true, name: true, email: true } },
} as const;

async function assertAssigneeIsMember(listId: string, assigneeId: string | null | undefined) {
  if (!assigneeId) return;
  const member = await prisma.listMember.findUnique({
    where: { listId_userId: { listId, userId: assigneeId } },
  });
  if (!member) throw badRequest("Assignee must be a member of this list");
}

async function loadTaskForUser(taskId: string, userId: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw notFound("Task not found");
  await requireListMember(task.listId, userId);
  return task;
}

tasksRouter.get("/lists/:id/tasks", async (req, res, next) => {
  try {
    const user = assertAuth(req);
    await requireListMember(param(req, "id"), user.id);

    const tasks = await prisma.task.findMany({
      where: { listId: param(req, "id") },
      orderBy: { position: "asc" },
      include: taskInclude,
    });

    res.json(tasks);
  } catch (err) {
    next(err);
  }
});

tasksRouter.post("/lists/:id/tasks", validateBody(createTaskSchema), async (req, res, next) => {
  try {
    const user = assertAuth(req);
    const listId = param(req, "id");
    await requireListMember(listId, user.id);

    const data = req.body as z.infer<typeof createTaskSchema>;
    await assertAssigneeIsMember(listId, data.assigneeId);

    const [maxTask, creatorMembership] = await Promise.all([
      prisma.task.aggregate({ where: { listId }, _max: { position: true } }),
      prisma.listMember.findUnique({
        where: { listId_userId: { listId, userId: user.id } },
      }),
    ]);

    if (!creatorMembership) throw badRequest("You are not a member of this list");

    const task = await prisma.task.create({
      data: {
        listId,
        title: data.title,
        description: data.description ?? null,
        status: data.status ?? "TODO",
        dueDate: data.dueDate ?? null,
        assigneeId: data.assigneeId ?? null,
        position: (maxTask._max?.position ?? -1) + 1,
        createdById: user.id,
      },
      include: taskInclude,
    });

    res.status(201).json(task);
  } catch (err) {
    next(err);
  }
});

tasksRouter.patch("/lists/:id/tasks/reorder", validateBody(reorderSchema), async (req, res, next) => {
  try {
    const user = assertAuth(req);
    const listId = param(req, "id");
    await requireListMember(listId, user.id);

    const { order } = req.body as z.infer<typeof reorderSchema>;
    const tasks = await prisma.task.findMany({
      where: { listId },
      select: { id: true },
    });
    const ids = new Set(tasks.map((t) => t.id));
    if (order.length !== ids.size || !order.every((id) => ids.has(id))) {
      throw badRequest("Order must include exactly the tasks in this list");
    }

    await prisma.$transaction(
      order.map((id, index) =>
        prisma.task.update({ where: { id }, data: { position: index } }),
      ),
    );

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

tasksRouter.patch("/tasks/:id", validateBody(updateTaskSchema), async (req, res, next) => {
  try {
    const user = assertAuth(req);
    const existing = await loadTaskForUser(param(req, "id"), user.id);

    const data = req.body as z.infer<typeof updateTaskSchema>;
    await assertAssigneeIsMember(existing.listId, data.assigneeId);

    const task = await prisma.task.update({
      where: { id: existing.id },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.dueDate !== undefined ? { dueDate: data.dueDate } : {}),
        ...(data.assigneeId !== undefined ? { assigneeId: data.assigneeId } : {}),
        ...(data.position !== undefined ? { position: data.position } : {}),
      },
      include: taskInclude,
    });

    res.json(task);
  } catch (err) {
    next(err);
  }
});

tasksRouter.delete("/tasks/:id", async (req, res, next) => {
  try {
    const user = assertAuth(req);
    const existing = await loadTaskForUser(param(req, "id"), user.id);
    await prisma.task.delete({ where: { id: existing.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
