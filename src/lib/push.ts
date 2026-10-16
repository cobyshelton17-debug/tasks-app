import { randomUUID } from "node:crypto";
import webpush from "web-push";
import { config, pushEnabled } from "../config.js";
import { prisma } from "../db.js";

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  listId?: string;
}

let vapidConfigured = false;
let vapidFailed = false;

function ensureVapid(): boolean {
  if (vapidConfigured) return true;
  if (vapidFailed) return false;
  if (!pushEnabled || !config.vapidPublicKey || !config.vapidPrivateKey) return false;
  try {
    webpush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);
    vapidConfigured = true;
    return true;
  } catch (err) {
    vapidFailed = true;
    if (!config.isTest) console.error("[push] invalid VAPID configuration", err);
    return false;
  }
}

export function pushConfigured(): boolean {
  return ensureVapid();
}

export async function sendToUser(userId: string, payload: PushPayload): Promise<void> {
  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subscriptions.length === 0) return;
  if (!ensureVapid()) return;

  const body = JSON.stringify(payload);

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
        );
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
          return;
        }
        console.error("[push] send failed", status ?? err);
      }
    }),
  );
}

export interface Actor {
  id: string;
  name: string;
}

async function claimThrottle(
  listId: string,
  userId: string,
  now: Date,
  windowMs: number,
): Promise<boolean> {
  const cutoff = new Date(now.getTime() - windowMs);
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO "NotificationThrottle" ("id", "listId", "userId", "lastNotifiedAt")
    VALUES (${randomUUID()}, ${listId}, ${userId}, ${now})
    ON CONFLICT ("listId", "userId")
    DO UPDATE SET "lastNotifiedAt" = EXCLUDED."lastNotifiedAt"
    WHERE "NotificationThrottle"."lastNotifiedAt" <= ${cutoff}
    RETURNING "id"
  `;
  return rows.length > 0;
}

export async function notifyListActivity(listId: string, actor: Actor): Promise<void> {
  try {
    const list = await prisma.taskList.findUnique({
      where: { id: listId },
      select: { name: true },
    });
    if (!list) return;

    const members = await prisma.listMember.findMany({
      where: { listId, userId: { not: actor.id } },
      select: { userId: true },
    });
    const recipientIds = members.map((m) => m.userId);
    if (recipientIds.length === 0) return;

    const subscribers = await prisma.pushSubscription.findMany({
      where: { userId: { in: recipientIds } },
      select: { userId: true },
      distinct: ["userId"],
    });
    if (subscribers.length === 0) return;
    if (!ensureVapid()) return;

    const now = new Date();
    for (const { userId } of subscribers) {
      const shouldSend = await claimThrottle(listId, userId, now, config.notifyThrottleMs);
      if (!shouldSend) continue;
      await sendToUser(userId, {
        title: list.name,
        body: `${actor.name} updated the list`,
        url: `/lists/${listId}`,
        listId,
      });
    }
  } catch (err) {
    console.error("[push] notifyListActivity failed", err);
  }
}

export async function notifyInvitation(
  userId: string,
  inviter: Actor,
  list: { id: string; name: string },
): Promise<void> {
  try {
    await sendToUser(userId, {
      title: `${inviter.name} invited you`,
      body: `Join "${list.name}"`,
      url: "/",
      listId: list.id,
    });
  } catch (err) {
    console.error("[push] notifyInvitation failed", err);
  }
}
