import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { config } from "../config.js";
import { ApiError } from "../lib/errors.js";

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof ApiError) {
    return res
      .status(err.status)
      .json({ error: { code: err.code, message: err.message, details: err.details } });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return res.status(409).json({
        error: { code: "CONFLICT", message: "A record with that value already exists" },
      });
    }
    if (err.code === "P2025") {
      return res
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "Record not found" } });
    }
  }

  const maybeBodyError = err as { type?: string; status?: number } | undefined;
  if (maybeBodyError?.type === "entity.parse.failed") {
    return res
      .status(400)
      .json({ error: { code: "INVALID_JSON", message: "Request body is not valid JSON" } });
  }

  if (config.nodeEnv !== "test") {
    console.error(err);
  }

  return res
    .status(500)
    .json({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
}
