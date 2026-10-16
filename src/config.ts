import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default("7d"),
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default("mailto:admin@example.com"),
  NOTIFY_THROTTLE_MS: z.coerce.number().int().min(0).default(300_000),
});

const env = envSchema.parse(process.env);

export const config = {
  databaseUrl: env.DATABASE_URL,
  jwtSecret: env.JWT_SECRET,
  jwtExpiresIn: env.JWT_EXPIRES_IN,
  port: env.PORT,
  corsOrigins: env.CORS_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean),
  nodeEnv: env.NODE_ENV,
  isTest: env.NODE_ENV === "test",
  vapidPublicKey: env.VAPID_PUBLIC_KEY,
  vapidPrivateKey: env.VAPID_PRIVATE_KEY,
  vapidSubject: env.VAPID_SUBJECT,
  notifyThrottleMs: env.NOTIFY_THROTTLE_MS,
} as const;

export const pushEnabled = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
