import type Database from "better-sqlite3";
import { CHECKPOINT_KEY } from "../config/constants.js";

interface CheckpointRow {
  key: string;
  value: string;
  updated_at: string;
}

export function createCheckpointRepository(db: Database.Database) {
  const getStmt = db.prepare<[string], CheckpointRow>(`
    SELECT key, value, updated_at FROM checkpoints WHERE key = ?
  `);

  const setStmt = db.prepare<[string, string]>(`
    INSERT INTO checkpoints (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      value      = excluded.value,
      updated_at = datetime('now')
  `);

  return {
    getLastScanDate(): string | null {
      const row = getStmt.get(CHECKPOINT_KEY);
      return row?.value ?? null;
    },

    setLastScanDate(isoDate: string): void {
      setStmt.run(CHECKPOINT_KEY, isoDate);
    },
  };
}
