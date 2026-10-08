import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { fromZodError } from "../lib/errors.js";

export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) return next(fromZodError(result.error));
    req.body = result.data;
    next();
  };
}

export function validateParams<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.params);
    if (!result.success) return next(fromZodError(result.error));
    next();
  };
}
