import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import { param } from "../lib/param.js";
import { requireListMember, requireListOwner } from "../lib/access.js";
import { assertAuth, requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";

export const listsRouter = Router();

listsRouter.use(requireAuth);

const listNameSchema = z
  .string()
  .trim()
  .min(1, "List name is required")
  .max(120, "List name must be at most 120 characters");

const createListSchema = z.object({ name: listNameSchema });
const updateListSchema = z.object({ name: listNameSchema });
const reorderSchema = z.object({ order: z.array(z.string().min(1)).min(1) });

const listInclude = {
  owner: { select: { id: true, name: true, email: true } },
  members: {
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" as const },
  },
  tasks: {
    select: { id: true, title: true, status: true, position: true },
    orderBy: { position: "asc" as const },
  },
  _count: { select: { tasks: true } },
};

listsRouter.get("/", async (req, res, next) => {
  try {
    const user = assertAuth(req);
    const memberships = await prisma.listMember.findMany({
      where: { userId: user.id },
      include: { list: { include: listInclude } },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    });

    res.json(
      memberships.map((m) => ({
        ...m.list,
        myRole: m.role,
      })),
    );
  } catch (err) {
    next(err);
  }
});

listsRouter.post("/", validateBody(createListSchema), async (req, res, next) => {
  try {
    const user = assertAuth(req);
    const { name } = req.body as z.infer<typeof createListSchema>;

    const maxPosition = await prisma.listMember.aggregate({
      where: { userId: user.id },
      _max: { position: true },
    });

    const list = await prisma.taskList.create({
      data: {
        name,
        ownerId: user.id,
        members: {
          create: {
            userId: user.id,
            role: "OWNER",
            position: (maxPosition._max.position ?? -1) + 1,
          },
        },
      },
      include: listInclude,
    });

    res.status(201).json({ ...list, myRole: "OWNER" as const });
  } catch (err) {
    next(err);
  }
});

listsRouter.get("/:id", async (req, res, next) => {
  try {
    const user = assertAuth(req);
    const membership = await requireListMember(param(req, "id"), user.id);

    const list = await prisma.taskList.findUnique({
      where: { id: param(req, "id") },
      include: {
        ...listInclude,
        tasks: {
          orderBy: { position: "asc" },
          include: {
            createdBy: { select: { id: true, name: true, email: true } },
            assignee: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });
    if (!list) throw notFound("List not found");

    res.json({ ...list, myRole: membership.role });
  } catch (err) {
    next(err);
  }
});

listsRouter.patch("/reorder", validateBody(reorderSchema), async (req, res, next) => {
  try {
    const user = assertAuth(req);
    const { order } = req.body as z.infer<typeof reorderSchema>;

    const memberships = await prisma.listMember.findMany({
      where: { userId: user.id },
      select: { listId: true },
    });
    const owned = new Set(memberships.map((m) => m.listId));
    if (order.length !== owned.size || !order.every((id) => owned.has(id))) {
      throw badRequest("Order must include exactly your lists");
    }

    await prisma.$transaction(
      order.map((listId, index) =>
        prisma.listMember.update({
          where: { listId_userId: { listId, userId: user.id } },
          data: { position: index },
        }),
      ),
    );

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

listsRouter.patch("/:id", validateBody(updateListSchema), async (req, res, next) => {
  try {
    const user = assertAuth(req);
    await requireListMember(param(req, "id"), user.id);
    const { name } = req.body as z.infer<typeof updateListSchema>;

    const list = await prisma.taskList.update({
      where: { id: param(req, "id") },
      data: { name },
      include: listInclude,
    });

    res.json(list);
  } catch (err) {
    next(err);
  }
});

listsRouter.delete("/:id", async (req, res, next) => {
  try {
    const user = assertAuth(req);
    await requireListOwner(param(req, "id"), user.id);
    await prisma.taskList.delete({ where: { id: param(req, "id") } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

listsRouter.get("/:id/members", async (req, res, next) => {
  try {
    const user = assertAuth(req);
    await requireListMember(param(req, "id"), user.id);

    const members = await prisma.listMember.findMany({
      where: { listId: param(req, "id") },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    });

    res.json(members.map((m) => ({ ...m.user, role: m.role, joinedAt: m.createdAt })));
  } catch (err) {
    next(err);
  }
});

listsRouter.post("/:id/members/leave", async (req, res, next) => {
  try {
    const user = assertAuth(req);
    const membership = await requireListMember(param(req, "id"), user.id);
    if (membership.role === "OWNER") {
      throw forbidden("Owners cannot leave their own list; delete it instead");
    }

    await prisma.listMember.delete({ where: { id: membership.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

listsRouter.delete("/:id/members/:userId", async (req, res, next) => {
  try {
    const user = assertAuth(req);
    const listId = param(req, "id");
    const targetUserId = param(req, "userId");
    await requireListOwner(listId, user.id);

    if (targetUserId === user.id) {
      throw badRequest("Owners cannot remove themselves; delete the list instead");
    }

    const target = await prisma.listMember.findUnique({
      where: { listId_userId: { listId, userId: targetUserId } },
    });
    if (!target) throw notFound("That user is not a member of this list");

    await prisma.listMember.delete({ where: { id: target.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

listsRouter.get("/:id/invitations", async (req, res, next) => {
  try {
    const user = assertAuth(req);
    await requireListOwner(param(req, "id"), user.id);

    const invitations = await prisma.invitation.findMany({
      where: { listId: param(req, "id") },
      include: { inviter: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
    });

    res.json(invitations);
  } catch (err) {
    next(err);
  }
});

listsRouter.delete("/:id/invitations/:invitationId", async (req, res, next) => {
  try {
    const user = assertAuth(req);
    const listId = param(req, "id");
    await requireListOwner(listId, user.id);

    const invitation = await prisma.invitation.findUnique({
      where: { id: param(req, "invitationId") },
    });
    if (!invitation || invitation.listId !== listId) {
      throw notFound("Invitation not found");
    }
    if (invitation.status !== "PENDING") {
      throw conflict("Only pending invitations can be revoked");
    }

    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: "REVOKED", respondedAt: new Date() },
    });

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
