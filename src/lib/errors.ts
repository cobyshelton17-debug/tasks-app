import type { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const badRequest = (message = "Bad request", details?: unknown) =>
  new ApiError(400, "BAD_REQUEST", message, details);

export const unauthorized = (message = "Unauthorized") =>
  new ApiError(401, "UNAUTHORIZED", message);

export const forbidden = (message = "Forbidden") =>
  new ApiError(403, "FORBIDDEN", message);

export const notFound = (message = "Not found") =>
  new ApiError(404, "NOT_FOUND", message);

export const conflict = (message = "Conflict") =>
  new ApiError(409, "CONFLICT", message);

export const fromZodError = (error: ZodError) => {
  const details = error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
  const message = details.map((d) => `${d.path || "body"}: ${d.message}`).join("; ");
  return new ApiError(400, "VALIDATION_ERROR", message || "Validation failed", details);
};
