import Database from "better-sqlite3";
import { env } from "../config/env.js";

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(env.DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
    runMigrations(_db);
  }
  return _db;
}

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS scans (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      badge_id    TEXT    NOT NULL,
      booth_name  TEXT    NOT NULL,
      scan_date   TEXT    NOT NULL,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(badge_id, scan_date)
    );

    CREATE INDEX IF NOT EXISTS idx_scans_badge_id  ON scans(badge_id);
    CREATE INDEX IF NOT EXISTS idx_scans_scan_date ON scans(scan_date);

    CREATE TABLE IF NOT EXISTS player_scan_counts (
      badge_id       TEXT PRIMARY KEY,
      scan_count     INTEGER NOT NULL DEFAULT 0,
      last_scan_date TEXT,
      updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS checkpoints (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}
