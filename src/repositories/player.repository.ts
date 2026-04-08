import type Database from "better-sqlite3";
import type { PlayerScanCount } from "../types/domain.js";

interface PlayerRow {
  badge_id: string;
  scan_count: number;
  last_scan_date: string | null;
  updated_at: string;
}

function rowToDomain(row: PlayerRow): PlayerScanCount {
  return {
    badgeId: row.badge_id,
    scanCount: row.scan_count,
    lastScanDate: row.last_scan_date,
  };
}

export function createPlayerRepository(db: Database.Database) {
  const upsertStmt = db.prepare<[string, string]>(`
    INSERT INTO player_scan_counts (badge_id, scan_count, last_scan_date, updated_at)
    VALUES (?, 1, ?, datetime('now'))
    ON CONFLICT(badge_id) DO UPDATE SET
      scan_count     = scan_count + 1,
      last_scan_date = excluded.last_scan_date,
      updated_at     = datetime('now')
  `);

  const selectAllStmt = db.prepare<[], PlayerRow>(`
    SELECT badge_id, scan_count, last_scan_date, updated_at
    FROM player_scan_counts
    ORDER BY scan_count DESC
  `);

  const selectOneStmt = db.prepare<[string], PlayerRow>(`
    SELECT badge_id, scan_count, last_scan_date, updated_at
    FROM player_scan_counts
    WHERE badge_id = ?
  `);

  const selectTopStmt = db.prepare<[], PlayerRow>(`
    SELECT badge_id, scan_count, last_scan_date, updated_at
    FROM player_scan_counts
    ORDER BY scan_count DESC
    LIMIT 1
  `);

  const selectBottomStmt = db.prepare<[], PlayerRow>(`
    SELECT badge_id, scan_count, last_scan_date, updated_at
    FROM player_scan_counts
    ORDER BY scan_count ASC
    LIMIT 1
  `);

  return {
    /**
     * Increments the scan count for a player atomically.
     * Call only when insertScan returned true (new scan row).
     */
    incrementScanCount(badgeId: string, scanDate: string): void {
      upsertStmt.run(badgeId, scanDate);
    },

    getAllPlayerCounts(): PlayerScanCount[] {
      return selectAllStmt.all().map(rowToDomain);
    },

    getPlayerById(badgeId: string): PlayerScanCount | null {
      const row = selectOneStmt.get(badgeId);
      return row ? rowToDomain(row) : null;
    },

    getTopPlayer(): PlayerScanCount | null {
      const row = selectTopStmt.get();
      return row ? rowToDomain(row) : null;
    },

    getBottomPlayer(): PlayerScanCount | null {
      const row = selectBottomStmt.get();
      return row ? rowToDomain(row) : null;
    },
  };
}
