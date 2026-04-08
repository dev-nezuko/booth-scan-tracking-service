import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  API_URL: z.string().url().default("https://portal.eventscloud.com/api/scan"),
  API_TOKEN: z.string().min(1),
  EVENT_START_DATE: z
    .string()
    .datetime({ offset: true })
    .default(new Date(0).toISOString()),
  POLL_INTERVAL_CRON: z.string().default("*/5 * * * *"),
  DB_PATH: z.string().default("./fankave.db"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "[config] Invalid environment variables:\n",
    parsed.error.flatten().fieldErrors,
  );
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof parsed.data;
