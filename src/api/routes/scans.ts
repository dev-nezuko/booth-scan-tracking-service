import { Router } from "express";
import type Database from "better-sqlite3";
import { createScanRepository } from "../../repositories/scan.repository.js";

export function createScansRouter(db: Database.Database): Router {
  const router = Router();
  const scanRepo = createScanRepository(db);

  /**
   * GET /scans
   * Search scans with optional filters. All params are optional and combinable.
   *
   * Query params:
   *   badgeId    — exact match on player badge ID
   *   boothName  — partial, case-insensitive match on booth name
   *   scanDate   — prefix match (e.g. "2026-02-09" matches all scans that day)
   *   limit      — max results to return (default 50, max 500)
   *   offset     — pagination offset (default 0)
   */
  router.get("/scans", (req, res) => {
    const badgeId = typeof req.query["badgeId"] === "string" ? req.query["badgeId"] : undefined;
    const boothName = typeof req.query["boothName"] === "string" ? req.query["boothName"] : undefined;
    const scanDate = typeof req.query["scanDate"] === "string" ? req.query["scanDate"] : undefined;

    const rawLimit = Number(req.query["limit"] ?? 50);
    const rawOffset = Number(req.query["offset"] ?? 0);

    const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 500) : 50;
    const offset = Number.isInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0;

    const { rows, total } = scanRepo.searchScans({ badgeId, boothName, scanDate, limit, offset });

    res.json({
      scans: rows.map((s) => ({
        badgeId: s.badge_id,
        boothName: s.booth_name,
        scanDate: s.scan_date,
      })),
      total,
      limit,
      offset,
    });
  });

  return router;
}
