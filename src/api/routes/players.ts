import { Router } from "express";
import type Database from "better-sqlite3";
import { createPlayerRepository } from "../../repositories/player.repository.js";
import { createScanRepository } from "../../repositories/scan.repository.js";

export function createPlayersRouter(db: Database.Database): Router {
  const router = Router();
  const playerRepo = createPlayerRepository(db);
  const scanRepo = createScanRepository(db);

  // GET /players — all players sorted by scan count desc
  router.get("/players", (_req, res) => {
    const players = playerRepo.getAllPlayerCounts();
    res.json({ players, total: players.length });
  });

  // GET /players/top — player with the highest scan count
  router.get("/players/top", (_req, res) => {
    const player = playerRepo.getTopPlayer();
    if (!player) {
      res.status(404).json({ error: "No players found" });
      return;
    }
    res.json({ player });
  });

  // GET /players/bottom — player with the lowest scan count
  router.get("/players/bottom", (_req, res) => {
    const player = playerRepo.getBottomPlayer();
    if (!player) {
      res.status(404).json({ error: "No players found" });
      return;
    }
    res.json({ player });
  });

  // GET /players/:badgeId — scan count + full scan history for one player
  router.get("/players/:badgeId", (req, res) => {
    const { badgeId } = req.params;
    const player = playerRepo.getPlayerById(badgeId);
    if (!player) {
      res.status(404).json({ error: "Player not found" });
      return;
    }
    const { rows: scans } = scanRepo.searchScans({ badgeId, limit: 1000, offset: 0 });
    res.json({
      ...player,
      scans: scans.map((s) => ({ boothName: s.booth_name, scanDate: s.scan_date })),
    });
  });

  return router;
}
