import "dotenv/config";
import http from "http";
import express from "express";
import { env } from "./src/config/env.js";
import { getDb } from "./src/db/client.js";
import { createWsServer } from "./src/websocket/server.js";
import { createPlayersRouter } from "./src/api/routes/players.js";
import { createScansRouter } from "./src/api/routes/scans.js";
import healthRouter from "./src/api/routes/health.js";
import { errorHandler } from "./src/api/middleware/error-handler.js";
import { notFoundHandler } from "./src/api/middleware/not-found.js";
import { startScheduler } from "./src/scheduler/index.js";
import { createPlayerRepository } from "./src/repositories/player.repository.js";
import { logger } from "./src/utils/logger.js";

const app = express();
app.use(express.json());

const db = getDb();

app.use(healthRouter);
app.use(createPlayersRouter(db));
app.use(createScansRouter(db));

app.use(notFoundHandler);
app.use(errorHandler);

const httpServer = http.createServer(app);

const playerRepo = createPlayerRepository(db);
createWsServer(httpServer, () => playerRepo.getAllPlayerCounts());

httpServer.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "HTTP + WebSocket server listening");
  startScheduler(db);
});

function shutdown(signal: string): void {
  logger.info({ signal }, "Shutting down gracefully");
  httpServer.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
