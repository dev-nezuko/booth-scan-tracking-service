import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { logger } from "../../utils/logger.js";
import { AppError } from "../errors/app-error.js";
import { sendFailure } from "../utils/respond.js";

/** When not "true", responses avoid leaking internals (generic 500, no stack). Set API_DEBUG_ERRORS=true to expose. */
function hideDebugInfo(): boolean {
  return process.env["API_DEBUG_ERRORS"] !== "true";
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) {
    return;
  }

  if (err instanceof ZodError) {
    sendFailure(res, 422, {
      code: "VALIDATION_ERROR",
      message: "Validation failed",
      details: err.flatten(),
    });
    return;
  }

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error(
        { err, code: err.code, statusCode: err.statusCode },
        "Application error (5xx)",
      );
    }

    const safe = hideDebugInfo();
    const details =
      err.details !== null && err.details !== undefined
        ? safe
          ? sanitizeDetails(err.details)
          : err.details
        : null;

    sendFailure(res, err.statusCode, {
      code: err.code,
      message: err.message,
      details,
    });
    return;
  }

  const unknown = err instanceof Error ? err : new Error(String(err));

  logger.error({ err: unknown }, "Unhandled error");

  const safe = hideDebugInfo();
  sendFailure(res, 500, {
    code: "INTERNAL_ERROR",
    message: safe ? "An unexpected error occurred" : unknown.message,
    details: safe ? null : { stack: unknown.stack ?? null },
  });
}

function sanitizeDetails(details: unknown): unknown {
  if (details === null || typeof details !== "object") {
    return details;
  }
  return details;
}
