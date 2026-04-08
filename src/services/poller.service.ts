import axios from "axios";
import { env } from "../config/env.js";
import { MAX_BATCH_SIZE } from "../config/constants.js";
import { ApiResponseSchema } from "../types/api.js";
import type { RawScan } from "../types/api.js";
import { retryWithBackoff } from "../utils/retry.js";
import { logger } from "../utils/logger.js";

interface FetchScansParams {
  scanDateGT: string;
}

/** Strips milliseconds and timezone suffix to match the API's expected format: yyyy-MM-ddThh:mm:ss */
function toApiDateFormat(isoDate: string): string {
  return new Date(isoDate).toISOString().slice(0, 19);
}

async function fetchBatch(params: FetchScansParams): Promise<RawScan[]> {
  const url = `${env.API_URL}?scanDateGT=${encodeURIComponent(toApiDateFormat(params.scanDateGT))}`;

  const response = await axios.post<unknown>(
    url,
    { token: env.API_TOKEN },
    { headers: { "Content-Type": "application/json" }, timeout: 30_000 },
  );

  const parsed = ApiResponseSchema.safeParse(response.data);
  if (!parsed.success) {
    logger.error({ issues: parsed.error.issues, url }, "API response validation failed");
    throw new Error("Invalid API response shape");
  }

  return parsed.data;
}

/**
 * Fetches all scans since `fromDate`, paginating transparently when the API
 * returns exactly MAX_BATCH_SIZE records (indicating more pages may exist).
 * Each page is yielded individually so the caller can commit + broadcast after
 * every page rather than buffering the entire event day in memory.
 */
export async function* fetchAllScansSince(
  fromDate: string,
): AsyncGenerator<RawScan[]> {
  let checkpoint = fromDate;

  while (true) {
    logger.info({ scanDateGT: checkpoint }, "Fetching scan batch from API");

    const batch = await retryWithBackoff(() => fetchBatch({ scanDateGT: checkpoint }));

    logger.info({ count: batch.length, scanDateGT: checkpoint }, "Batch received");

    if (batch.length === 0) break;

    yield batch;

    if (batch.length < MAX_BATCH_SIZE) break;

    // Advance the cursor to the maximum scanDate seen in this batch, then fetch
    // the next page. Using reduce (not batch[last]) guards against the API
    // returning records that aren't in perfectly ascending order.
    const maxDate = batch.reduce(
      (max, r) => (r.scanDate > max ? r.scanDate : max),
      batch[0]?.scanDate ?? checkpoint,
    );

    // Safety guard: if the cursor didn't advance we'd loop forever.
    if (maxDate <= checkpoint) break;
    checkpoint = maxDate;
  }
}
