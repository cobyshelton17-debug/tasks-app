import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireListOwner } from "../lib/access.js";
import { conflict, notFound } from "../lib/errors.js";
import { notifyInvitation, notifyListActivity } from "../lib/push.js";
import { param } from "../lib/param.js";
import { assertAuth, requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";

export const invitationsRouter = Router();

invitationsRouter.use(requireAuth);

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email address"),
});

const pendingOnly = (status: string) => {
  if (status !== "PENDING") throw conflict("This invitation is no longer pending");
};

invitationsRouter.post(
  "/lists/:id/invitations",
  validateBody(inviteSchema),
  async (req, res, next) => {
    try {
      const user = assertAuth(req);
      const listId = param(req, "id");
      await requireListOwner(listId, user.id);

      const { email } = req.body as z.infer<typeof inviteSchema>;
      if (email === user.email.toLowerCase()) {
        return res
          .status(400)
          .json({ error: { code: "BAD_REQUEST", message: "You cannot invite yourself" } });
      }

      const invitee = await prisma.user.findUnique({ where: { email } });
      if (invitee) {
        const existingMember = await prisma.listMember.findUnique({
          where: { listId_userId: { listId, userId: invitee.id } },
        });
        if (existingMember) throw conflict("That user is already a member of this list");
      }

      const pending = await prisma.invitation.findFirst({
        where: { listId, inviteeEmail: email, status: "PENDING" },
      });
      if (pending) throw conflict("A pending invitation already exists for this email");

      const invitation = await prisma.invitation.create({
        data: { listId, inviteeEmail: email, invitedById: user.id },
        include: {
          list: { select: { id: true, name: true } },
          inviter: { select: { id: true, name: true, email: true } },
        },
      });

      if (invitee) {
        await notifyInvitation(invitee.id, { id: user.id, name: user.name }, invitation.list);
      }

      res.status(201).json(invitation);
    } catch (err) {
      next(err);
    }
  },
);

invitationsRouter.get("/invitations", async (req, res, next) => {
  try {
    const user = assertAuth(req);
    const invitations = await prisma.invitation.findMany({
      where: { inviteeEmail: user.email.toLowerCase(), status: "PENDING" },
      include: {
        list: { select: { id: true, name: true } },
        inviter: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(invitations);
  } catch (err) {
    next(err);
  }
});

async function loadInviteeInvitation(id: string, email: string) {
  const invitation = await prisma.invitation.findUnique({
    where: { id },
    include: {
      list: { select: { id: true, name: true } },
      inviter: { select: { id: true, name: true, email: true } },
    },
  });
  if (!invitation || invitation.inviteeEmail !== email.toLowerCase()) {
    throw notFound("Invitation not found");
  }
  return invitation;
}

invitationsRouter.post("/invitations/:id/accept", async (req, res, next) => {
  try {
    const user = assertAuth(req);
    const invitation = await loadInviteeInvitation(param(req, "id"), user.email);
    pendingOnly(invitation.status);

    const maxPosition = await prisma.listMember.aggregate({
      where: { userId: user.id },
      _max: { position: true },
    });

    const [updated] = await prisma.$transaction([
      prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: "ACCEPTED", respondedAt: new Date() },
      }),
      prisma.listMember.upsert({
        where: { listId_userId: { listId: invitation.listId, userId: user.id } },
        create: {
          listId: invitation.listId,
          userId: user.id,
          role: "EDITOR",
          position: (maxPosition._max.position ?? -1) + 1,
        },
        update: {},
      }),
    ]);

    await notifyListActivity(invitation.listId, { id: user.id, name: user.name });

    res.json({ ...updated, list: invitation.list, inviter: invitation.inviter });
  } catch (err) {
    next(err);
  }
});

invitationsRouter.post("/invitations/:id/decline", async (req, res, next) => {
  try {
    const user = assertAuth(req);
    const invitation = await loadInviteeInvitation(param(req, "id"), user.email);
    pendingOnly(invitation.status);

    const updated = await prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: "DECLINED", respondedAt: new Date() },
    });

    res.json({ ...updated, list: invitation.list, inviter: invitation.inviter });
  } catch (err) {
    next(err);
  }
});
