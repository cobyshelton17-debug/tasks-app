import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { ApiError, unauthorized } from "../lib/errors.js";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(unauthorized("Missing bearer token"));
  }

  const token = header.slice("Bearer ".length);
  let payload: jwt.JwtPayload;
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    if (typeof decoded === "string") throw new Error("unexpected token format");
    payload = decoded;
  } catch {
    return next(unauthorized("Invalid or expired token"));
  }

  if (typeof payload.sub !== "string") {
    return next(unauthorized("Invalid token payload"));
  }

  prisma.user
    .findUnique({ where: { id: payload.sub }, select: { id: true, email: true, name: true } })
    .then((user) => {
      if (!user) return next(unauthorized("Account no longer exists"));
      req.user = user;
      next();
    })
    .catch(next);
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next();

  const token = header.slice("Bearer ".length);
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    if (typeof decoded === "string" || typeof decoded.sub !== "string") return next();
    prisma.user
      .findUnique({
        where: { id: decoded.sub },
        select: { id: true, email: true, name: true },
      })
      .then((user) => {
        if (user) req.user = user;
        next();
      })
      .catch(next);
  } catch {
    next();
  }
}

export function assertAuth(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}
