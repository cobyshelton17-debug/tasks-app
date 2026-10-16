import { Router } from "express";
import { z } from "zod";
import { pushConfigured } from "../lib/push.js";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { assertAuth, requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";

export const pushRouter = Router();

pushRouter.use(requireAuth);

pushRouter.get("/public-key", (_req, res) => {
  if (!pushConfigured() || !config.vapidPublicKey) {
    res
      .status(503)
      .json({ error: { code: "PUSH_UNAVAILABLE", message: "Push notifications are not configured" } });
    return;
  }
  res.json({ publicKey: config.vapidPublicKey });
});

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

pushRouter.post("/subscribe", validateBody(subscribeSchema), async (req, res, next) => {
  try {
    const user = assertAuth(req);
    const { endpoint, keys } = req.body as z.infer<typeof subscribeSchema>;
    const header = req.headers["user-agent"];
    const userAgent = typeof header === "string" ? header : null;

    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { endpoint, userId: user.id, p256dh: keys.p256dh, auth: keys.auth, userAgent },
      update: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth, userAgent },
    });

    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

const unsubscribeSchema = z.object({ endpoint: z.string().min(1) });

pushRouter.post("/unsubscribe", validateBody(unsubscribeSchema), async (req, res, next) => {
  try {
    const user = assertAuth(req);
    const { endpoint } = req.body as z.infer<typeof unsubscribeSchema>;
    await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
