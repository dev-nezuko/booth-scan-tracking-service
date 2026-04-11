import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";
import type { RawScan } from "../types/api.js";
import { fetchAllScansInRange } from "./poller.service.js";

vi.mock("axios", () => ({
  default: {
    post: vi.fn(),
  },
}));

vi.mock("../config/env.js", () => ({
  env: {
    API_URL: "https://portal.example.com/api/scan",
    API_TOKEN: "test-token",
  },
}));

vi.mock("../utils/retry.js", () => ({
  retryWithBackoff: <T,>(fn: () => Promise<T>): Promise<T> => fn(),
}));

vi.mock("../utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

function okJson(data: unknown) {
  return {
    status: 200,
    headers: { "content-type": "application/json" },
    data,
  };
}

function makeScan(i: number, scanDate: string): RawScan {
  return {
    badgeId: `badge-${i}`,
    scanDate,
    customFields: [],
  };
}

describe("fetchAllScansInRange", () => {
  beforeEach(() => {
    vi.mocked(axios.post).mockReset();
  });

  it("yields a single batch when the API returns fewer than 1000 rows", async () => {
    const rows = Array.from({ length: 50 }, (_, i) =>
      makeScan(i, "2026-02-09T10:00:00.000Z"),
    );
    vi.mocked(axios.post).mockResolvedValue(okJson(rows));

    const batches: RawScan[][] = [];
    for await (const b of fetchAllScansInRange(
      "2026-02-09T00:00:00.000Z",
      "2026-02-10T00:00:00.000Z",
    )) {
      batches.push(b);
    }

    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(50);
    expect(axios.post).toHaveBeenCalledTimes(1);
    const url = vi.mocked(axios.post).mock.calls[0][0] as string;
    expect(url).toContain("scanDateGT=");
    expect(url).toContain("scanDateLT=");
  });

  it("subdivides when a wide window returns exactly 1000 rows", async () => {
    const big = Array.from({ length: 1000 }, (_, i) =>
      makeScan(i, "2026-06-15T12:00:00.000Z"),
    );
    const small = Array.from({ length: 40 }, (_, i) =>
      makeScan(i + 10_000, "2026-06-15T14:00:00.000Z"),
    );

    vi.mocked(axios.post).mockImplementation(async (url: string) => {
      const u = new URL(url);
      const lo = Date.parse(u.searchParams.get("scanDateGT")!);
      const hi = Date.parse(u.searchParams.get("scanDateLT")!);
      const span = hi - lo;
      if (span >= 6 * 86_400_000) {
        return okJson(big);
      }
      return okJson(small);
    });

    const batches: RawScan[][] = [];
    for await (const b of fetchAllScansInRange(
      "2026-06-01T00:00:00.000Z",
      "2026-06-10T00:00:00.000Z",
    )) {
      batches.push(b);
    }

    expect(batches.length).toBeGreaterThanOrEqual(2);
    expect(batches.every((b) => b.length < 1000)).toBe(true);
    expect(vi.mocked(axios.post).mock.calls.length).toBeGreaterThan(1);
  });

  it("throws when more than 1000 rows remain in a 1ms-wide window", async () => {
    const big = Array.from({ length: 1000 }, (_, i) =>
      makeScan(i, "1970-01-01T00:00:00.000Z"),
    );
    vi.mocked(axios.post).mockResolvedValue(okJson(big));

    const gen = fetchAllScansInRange("1970-01-01T00:00:00.000Z", "1970-01-01T00:00:00.002Z");
    await expect(async () => {
      for await (const _ of gen) {
        /* drain */
      }
    }).rejects.toThrow(/subdivide further/);
  });

  it("yields nothing when lower bound is not before upper bound", async () => {
    const batches: RawScan[][] = [];
    for await (const b of fetchAllScansInRange(
      "2026-02-10T00:00:00.000Z",
      "2026-02-09T00:00:00.000Z",
    )) {
      batches.push(b);
    }

    expect(batches).toHaveLength(0);
    expect(axios.post).not.toHaveBeenCalled();
  });
});


describe("exclusive window boundaries", () => {
  it("keeps the exact split timestamp instead of dropping its row", async () => {
    const origin = Date.parse("2026-02-09T00:00:00.000Z");
    const rows = Array.from({ length: 1001 }, (_, i) => makeScan(i, new Date(origin + 500 + i).toISOString()));
    vi.mocked(axios.post).mockImplementation(async (url: string) => {
      const query = new URL(url).searchParams;
      const lo = Date.parse(query.get("scanDateGT")! + "Z");
      const hi = Date.parse(query.get("scanDateLT")! + "Z");
      return okJson(rows.filter(r => Date.parse(r.scanDate) > lo && Date.parse(r.scanDate) < hi).slice(0, 1000));
    });
    const received: RawScan[] = [];
    for await (const batch of fetchAllScansInRange(new Date(origin).toISOString(), new Date(origin + 2000).toISOString())) received.push(...batch);
    expect(new Set(received.map(r => r.badgeId)).size).toBe(1001);
    expect(received.some(r => r.scanDate === new Date(origin + 1000).toISOString())).toBe(true);
  });
});
