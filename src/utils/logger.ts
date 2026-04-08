import pino from "pino";
import { env } from "../config/env.js";

const isDev =
  process.env.NODE_ENV !== "production" && process.stdout.isTTY;

export const logger = pino({
  level: env.LOG_LEVEL,
  ...(isDev && {
    transport: {
      target: "pino-pretty",
      options: { colorize: true, translateTime: "SYS:standard" },
    },
  }),
});
