import cors from "cors";
import express from "express";
import * as rateLimitNs from "express-rate-limit";
import * as helmetNs from "helmet";
import { config } from "./config.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { authRouter } from "./routes/auth.js";
import { invitationsRouter } from "./routes/invitations.js";
import { listsRouter } from "./routes/lists.js";
import { tasksRouter } from "./routes/tasks.js";

const helmet = helmetNs.default as unknown as (
  options?: helmetNs.HelmetOptions,
) => express.RequestHandler;
const rateLimit = rateLimitNs.default as unknown as (
  options?: Partial<rateLimitNs.Options>,
) => express.RequestHandler;

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigins.length > 0 ? config.corsOrigins : true,
    }),
  );
  app.use(express.json({ limit: "100kb" }));

  if (!config.isTest) {
    app.use(
      "/api/auth",
      rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 100,
        standardHeaders: true,
        legacyHeaders: false,
      }),
    );
  }

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/lists", listsRouter);
  app.use("/api", invitationsRouter);
  app.use("/api", tasksRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = createApp();
export default app;
