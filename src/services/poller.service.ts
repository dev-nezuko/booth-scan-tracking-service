import axios from "axios";
import { env } from "../config/env.js";
import { MAX_BATCH_SIZE } from "../config/constants.js";
import { ApiResponseSchema } from "../types/api.js";
import type { RawScan } from "../types/api.js";
import { retryWithBackoff } from "../utils/retry.js";
import { logger } from "../utils/logger.js";

function parseMs(iso: string): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) {
    throw new Error(`Invalid date string: ${iso}`);
  }
  return t;
}

/**
 * Builds scanDateGT / scanDateLT query values. Uses second precision when the
 * window spans whole seconds (matches API samples); uses millisecond precision
 * when the exclusive window lies inside a single second so subdivision still works.
 */
function boundsToQueryParams(loMs: number, hiMs: number): { scanDateGT: string; scanDateLT: string } {
  if (loMs >= hiMs) {
    throw new Error("scanDateGT must be strictly less than scanDateLT");
  }
  const loIso = new Date(loMs).toISOString();
  const hiIso = new Date(hiMs).toISOString();
  const sameSecond = loIso.slice(0, 19) === hiIso.slice(0, 19);
  if (sameSecond) {
    return { scanDateGT: loIso.slice(0, 23), scanDateLT: hiIso.slice(0, 23) };
  }
  return { scanDateGT: loIso.slice(0, 19), scanDateLT: hiIso.slice(0, 19) };
}

function buildScanUrl(scanDateGT: string, scanDateLT: string): string {
  const u = new URL(env.API_URL);
  u.searchParams.set("scanDateGT", scanDateGT);
  u.searchParams.set("scanDateLT", scanDateLT);
  return u.toString();
}

async function fetchBatchBetween(loMs: number, hiMs: number): Promise<RawScan[]> {
  const { scanDateGT, scanDateLT } = boundsToQueryParams(loMs, hiMs);
  const url = buildScanUrl(scanDateGT, scanDateLT);

  const response = await axios.post<unknown>(url, { token: env.API_TOKEN }, {
    headers: { "Content-Type": "application/json" },
    timeout: 30_000,
    validateStatus: () => true,
  });

  if (response.status !== 200) {
    logger.error({ status: response.status, url }, "Scan API non-200 response");
    throw new Error(`Scan API returned status ${response.status}`);
  }

  const contentType = response.headers["content-type"] ?? "";
  if (!contentType.includes("application/json")) {
    logger.error({ contentType, url }, "Scan API response is not JSON");
    throw new Error("Scan API response must be application/json");
  }

  const parsed = ApiResponseSchema.safeParse(response.data);
  if (!parsed.success) {
    logger.error({ issues: parsed.error.issues, url }, "API response validation failed");
    throw new Error("Invalid API response shape");
  }

  return parsed.data;
}

/**
 * Recursively subdivides the exclusive window (loMs, hiMs) until each API response
 * has fewer than MAX_BATCH_SIZE rows, so no poll cycle stops after a single full page.
 */
async function* fetchRangeMs(loMs: number, hiMs: number): AsyncGenerator<RawScan[]> {
  if (loMs >= hiMs) {
    return;
  }

  logger.info({ loMs, hiMs }, "Fetching scan range from API");

  const batch = await retryWithBackoff(() => fetchBatchBetween(loMs, hiMs));

  logger.info({ count: batch.length, loMs, hiMs }, "Scan range batch received");

  if (batch.length === 0) {
    return;
  }

  if (batch.length < MAX_BATCH_SIZE) {
    yield batch;
    return;
  }

  // Overflow: split the time window (not cursor-by-max-date) so duplicate scanDate
  // values cannot hide rows beyond the first 1000.
  if (hiMs - loMs <= 1) {
    throw new Error(
      "Scan fetch: more than 1000 scans in a 1ms window; cannot subdivide further. Check API or clock precision.",
    );
  }

  const midMs = Math.floor((loMs + hiMs) / 2);
  let split = midMs;
  if (split <= loMs) {
    split = loMs + 1;
  }
  if (split >= hiMs) {
    split = hiMs - 1;
  }

  if (split <= loMs || split >= hiMs) {
    throw new Error("Scan fetch: could not compute an interior split point for overflow batch");
  }

  yield* fetchRangeMs(loMs, split);
  yield* fetchRangeMs(split, hiMs);
}

/**
 * Fetches all scans in the exclusive interval (fromDate, upperBoundExclusive) using
 * scanDateGT + scanDateLT on every request. Yields each sub-batch in ascending time
 * order so checkpoint advancement stays monotonic.
 */
export async function* fetchAllScansInRange(
  fromDate: string,
  upperBoundExclusive: string,
): AsyncGenerator<RawScan[]> {
  const loMs = parseMs(fromDate);
  const hiMs = parseMs(upperBoundExclusive);
  if (loMs >= hiMs) {
    logger.warn({ fromDate, upperBoundExclusive }, "Empty fetch range (lower >= upper), skipping");
    return;
  }
  yield* fetchRangeMs(loMs, hiMs);
}
