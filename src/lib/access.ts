import { prisma } from "../db.js";
import { forbidden, notFound } from "./errors.js";

export type Membership = Awaited<ReturnType<typeof getMembership>>;

export async function getMembership(listId: string, userId: string) {
  return prisma.listMember.findUnique({
    where: { listId_userId: { listId, userId } },
  });
}

export async function requireListMember(listId: string, userId: string) {
  const list = await prisma.taskList.findUnique({
    where: { id: listId },
    select: { id: true },
  });
  if (!list) throw notFound("List not found");

  const membership = await getMembership(listId, userId);
  if (!membership) throw forbidden("You do not have access to this list");
  return membership;
}

export async function requireListOwner(listId: string, userId: string) {
  const membership = await requireListMember(listId, userId);
  if (membership.role !== "OWNER") {
    throw forbidden("Only the list owner can do this");
  }
  return membership;
}
