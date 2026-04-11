/**
 * Base class for HTTP errors with a stable machine `code` and optional `details`
 * (e.g. validation field errors). Thrown from route handlers; mapped by error middleware.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details: unknown | null;

  constructor(statusCode: number, code: string, message: string, details: unknown | null = null) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, details: unknown | null = null, code = "BAD_REQUEST") {
    super(400, code, message, details);
    this.name = "BadRequestError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized", details: unknown | null = null, code = "UNAUTHORIZED") {
    super(401, code, message, details);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden", details: unknown | null = null, code = "FORBIDDEN") {
    super(403, code, message, details);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, details: unknown | null = null, code = "NOT_FOUND") {
    super(404, code, message, details);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details: unknown | null = null, code = "CONFLICT") {
    super(409, code, message, details);
    this.name = "ConflictError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details: unknown | null = null, code = "VALIDATION_ERROR") {
    super(422, code, message, details);
    this.name = "ValidationError";
  }
}

export class InternalServerError extends AppError {
  constructor(message = "Internal server error", details: unknown | null = null, code = "INTERNAL_ERROR") {
    super(500, code, message, details);
    this.name = "InternalServerError";
  }
}

export class BadGatewayError extends AppError {
  constructor(message = "Bad gateway", details: unknown | null = null, code = "BAD_GATEWAY") {
    super(502, code, message, details);
    this.name = "BadGatewayError";
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = "Service unavailable", details: unknown | null = null, code = "SERVICE_UNAVAILABLE") {
    super(503, code, message, details);
    this.name = "ServiceUnavailableError";
  }
}
