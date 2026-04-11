import { Router } from "express";
import type Database from "better-sqlite3";
import { NotFoundError } from "../errors/index.js";
import { syncHandler } from "../middleware/async-handler.js";
import { sendSuccess } from "../utils/respond.js";
import { createPlayerRepository } from "../../repositories/player.repository.js";
import { createScanRepository } from "../../repositories/scan.repository.js";

export function createPlayersRouter(db: Database.Database): Router {
  const router = Router();
  const playerRepo = createPlayerRepository(db);
  const scanRepo = createScanRepository(db);

  router.get("/players", (_req, res) => {
    const players = playerRepo.getAllPlayerCounts();
    sendSuccess(res, { players, total: players.length });
  });

  router.get(
    "/players/top",
    syncHandler((_req, res) => {
      const player = playerRepo.getTopPlayer();
      if (!player) {
        throw new NotFoundError("No players found", null, "PLAYERS_EMPTY");
      }
      sendSuccess(res, { player });
    }),
  );

  router.get(
    "/players/bottom",
    syncHandler((_req, res) => {
      const player = playerRepo.getBottomPlayer();
      if (!player) {
        throw new NotFoundError("No players found", null, "PLAYERS_EMPTY");
      }
      sendSuccess(res, { player });
    }),
  );

  router.get(
    "/players/:badgeId",
    syncHandler((req, res) => {
      const raw = req.params["badgeId"];
      const badgeId = typeof raw === "string" ? raw : raw?.[0] ?? "";
      const player = playerRepo.getPlayerById(badgeId);
      if (!player) {
        throw new NotFoundError("Player not found", { badgeId }, "PLAYER_NOT_FOUND");
      }
      const { rows: scans } = scanRepo.searchScans({ badgeId, limit: 1000, offset: 0 });
      sendSuccess(res, {
        ...player,
        scans: scans.map((s) => ({ boothName: s.booth_name, scanDate: s.scan_date })),
      });
    }),
  );

  return router;
}
