import { WebSocket } from "ws";
import type { PlayerScanCount, WsMessage } from "../types/domain.js";
import { getWsServer } from "./server.js";
import { logger } from "../utils/logger.js";

export function broadcastPlayerCounts(players: PlayerScanCount[]): void {
  const wss = getWsServer();
  if (!wss) return;

  const message: WsMessage = { type: "update", players };
  const payload = JSON.stringify(message);

  let sent = 0;
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
      sent++;
    }
  });

  if (sent > 0) {
    logger.debug({ clientCount: sent, playerCount: players.length }, "Broadcast sent");
  }
}
