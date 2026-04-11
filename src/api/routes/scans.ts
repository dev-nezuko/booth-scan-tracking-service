import { Router } from "express";
import { z } from "zod";
import type Database from "better-sqlite3";
import { syncHandler } from "../middleware/async-handler.js";
import { sendSuccess } from "../utils/respond.js";
import { createScanRepository } from "../../repositories/scan.repository.js";

const ScansQuerySchema = z.object({
  badgeId: z.string().optional(),
  boothName: z.string().optional(),
  scanDate: z.string().optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export function createScansRouter(db: Database.Database): Router {
  const router = Router();
  const scanRepo = createScanRepository(db);

  router.get(
    "/scans",
    syncHandler((req, res) => {
      const parsed = ScansQuerySchema.safeParse({
        badgeId: req.query["badgeId"],
        boothName: req.query["boothName"],
        scanDate: req.query["scanDate"],
        limit: req.query["limit"],
        offset: req.query["offset"],
      });

      if (!parsed.success) {
        throw parsed.error;
      }

      const { badgeId, boothName, scanDate } = parsed.data;
      const limit = parsed.data.limit ?? 50;
      const offset = parsed.data.offset ?? 0;

      const { rows, total } = scanRepo.searchScans({ badgeId, boothName, scanDate, limit, offset });

      sendSuccess(res, {
        scans: rows.map((s) => ({
          badgeId: s.badge_id,
          boothName: s.booth_name,
          scanDate: s.scan_date,
        })),
        total,
        limit,
        offset,
      });
    }),
  );

  return router;
}
