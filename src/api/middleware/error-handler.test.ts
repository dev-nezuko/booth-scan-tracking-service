import express from "express";
import request from "supertest";
import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { UnauthorizedError } from "../errors/app-error.js";
import { syncHandler } from "./async-handler.js";
import { errorHandler } from "./error-handler.js";
import { notFoundHandler } from "./not-found.js";
import healthRouter from "../routes/health.js";

vi.mock("../../utils/logger.js", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  },
}));

function createTestApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(healthRouter);
  app.get(
    "/__test/unauthorized",
    syncHandler((_req, _res) => {
      throw new UnauthorizedError("Invalid token");
    }),
  );
  app.get(
    "/__test/zod",
    syncHandler((_req, _res) => {
      z.object({ n: z.number() }).parse({ n: "not-a-number" });
    }),
  );
  app.get(
    "/__test/500",
    syncHandler((_req, _res) => {
      throw new Error("boom");
    }),
  );
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

describe("API envelope and errorHandler", () => {
  it("GET /health returns 200 with success envelope", async () => {
    const res = await request(createTestApp()).get("/health").expect(200);
    expect(res.body).toMatchObject({
      success: true,
      error: null,
    });
    expect(res.body.data).toMatchObject({ ok: true });
    expect(typeof res.body.data.ts).toBe("string");
  });

  it("unknown route returns 404 NOT_FOUND envelope", async () => {
    const res = await request(createTestApp()).get("/nope").expect(404);
    expect(res.body).toMatchObject({
      success: false,
      data: null,
      error: { code: "NOT_FOUND" },
    });
  });

  it("UnauthorizedError returns 401 envelope", async () => {
    const res = await request(createTestApp()).get("/__test/unauthorized").expect(401);
    expect(res.body).toMatchObject({
      success: false,
      data: null,
      error: { code: "UNAUTHORIZED", message: "Invalid token" },
    });
  });

  it("ZodError returns 422 VALIDATION_ERROR envelope", async () => {
    const res = await request(createTestApp()).get("/__test/zod").expect(422);
    expect(res.body).toMatchObject({
      success: false,
      data: null,
      error: { code: "VALIDATION_ERROR", message: "Validation failed" },
    });
    expect(res.body.error.details).toBeDefined();
  });

  it("unknown Error returns generic 500 message when API_DEBUG_ERRORS is unset", async () => {
    const prev = process.env["API_DEBUG_ERRORS"];
    delete process.env["API_DEBUG_ERRORS"];
    try {
      const res = await request(createTestApp()).get("/__test/500").expect(500);
      expect(res.body).toMatchObject({
        success: false,
        data: null,
        error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" },
      });
      expect(res.body.error.details).toBeNull();
    } finally {
      if (prev !== undefined) {
        process.env["API_DEBUG_ERRORS"] = prev;
      }
    }
  });

  it("unknown Error exposes message when API_DEBUG_ERRORS=true", async () => {
    const prev = process.env["API_DEBUG_ERRORS"];
    process.env["API_DEBUG_ERRORS"] = "true";
    try {
      const res = await request(createTestApp()).get("/__test/500").expect(500);
      expect(res.body.error.message).toContain("boom");
    } finally {
      if (prev !== undefined) {
        process.env["API_DEBUG_ERRORS"] = prev;
      } else {
        delete process.env["API_DEBUG_ERRORS"];
      }
    }
  });
});
