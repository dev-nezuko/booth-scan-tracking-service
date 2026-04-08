import cron from "node-cron";
import type Database from "better-sqlite3";
import { runPollCycle } from "../services/scan.service.js";
import { logger } from "../utils/logger.js";
import { env } from "../config/env.js";

let isRunning = false;

async function safePollCycle(db: Database.Database): Promise<void> {
  if (isRunning) {
    logger.warn("Poll cycle already in progress, skipping this tick");
    return;
  }

  isRunning = true;
  try {
    await runPollCycle(db);
  } catch (err) {
    // retryWithBackoff already exhausted its attempts — log and continue.
    // The checkpoint was not advanced, so the next cycle will re-fetch from
    // the last successful position — no data is lost.
    logger.error({ err }, "Poll cycle failed after all retries, will resume next tick");
  } finally {
    isRunning = false;
  }
}

export function startScheduler(db: Database.Database): void {
  logger.info({ cron: env.POLL_INTERVAL_CRON }, "Starting poll scheduler");

  cron.schedule(env.POLL_INTERVAL_CRON, () => {
    void safePollCycle(db);
  });

  // Run one cycle immediately on startup so we don't wait up to 5 minutes
  // for the first data point.
  void safePollCycle(db);
}
