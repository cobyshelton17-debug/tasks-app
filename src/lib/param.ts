import type { Request } from "express";
import { badRequest } from "./errors.js";

export function param(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  throw badRequest(`Missing route parameter: ${name}`);
}
