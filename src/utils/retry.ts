import { logger } from "./logger.js";
import { RETRY_BASE_DELAY_MS, RETRY_MAX_ATTEMPTS } from "../config/constants.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts: number = RETRY_MAX_ATTEMPTS,
  baseDelayMs: number = RETRY_BASE_DELAY_MS,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const delayMs = baseDelayMs * Math.pow(2, attempt - 1);

      logger.warn(
        { attempt, maxAttempts, delayMs, err },
        "Operation failed, retrying...",
      );

      if (attempt < maxAttempts) {
        await sleep(delayMs);
      }
    }
  }

  throw lastError;
}
