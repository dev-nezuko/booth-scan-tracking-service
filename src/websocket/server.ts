import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import type { Server } from "http";
import type { PlayerScanCount, WsMessage } from "../types/domain.js";
import { logger } from "../utils/logger.js";

let wss: WebSocketServer | null = null;

export function createWsServer(
  httpServer: Server,
  getSnapshot: () => PlayerScanCount[],
): WebSocketServer {
  wss = new WebSocketServer({ server: httpServer });

  wss.on("connection", (socket: WebSocket, req: IncomingMessage) => {
    logger.info({ remoteAddress: req.socket.remoteAddress }, "WS client connected");

    const snapshot: WsMessage = { type: "snapshot", players: getSnapshot() };
    socket.send(JSON.stringify(snapshot));

    socket.on("error", (err) => {
      logger.error({ err }, "WS socket error");
    });

    socket.on("close", () => {
      logger.info({ remoteAddress: req.socket.remoteAddress }, "WS client disconnected");
    });
  });

  wss.on("error", (err) => {
    logger.error({ err }, "WebSocketServer error");
  });

  return wss;
}

export function getWsServer(): WebSocketServer | null {
  return wss;
}
