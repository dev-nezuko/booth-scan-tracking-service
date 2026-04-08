# Fankave — Event Scan Tracking System

A production-grade Node.js + TypeScript backend that polls the EventsCloud scan API every 5 minutes, tracks booth scan counts per player in SQLite, and broadcasts real-time updates over WebSocket.

---

## What It Does

During a live event, attendees scan at booths. This system:

1. **Polls** `POST /api/scan` every 5 minutes (configurable)
2. **Deduplicates** scans using a `(badgeId, scanDate)` unique constraint
3. **Persists** scan records and per-player counts in a local SQLite database
4. **Broadcasts** real-time updates to connected WebSocket clients after each poll
5. **Resumes safely** after a crash — a durable checkpoint ensures no scans are missed

---

## Tech Stack

### Runtime Dependencies

| Package | Version | Purpose |
|---|---|---|
| `express` | ^5.1.0 | HTTP server & REST API |
| `better-sqlite3` | ^12.8.0 | Synchronous SQLite driver |
| `axios` | ^1.14.0 | HTTP client for the EventsCloud API |
| `axios-retry` | ^4.5.0 | Retry plugin for axios |
| `node-cron` | ^4.2.1 | Cron scheduler (poll every 5 min) |
| `ws` | ^8.20.0 | WebSocket server |
| `pino` | ^10.3.1 | Structured JSON logger |
| `zod` | ^4.3.6 | Runtime validation for env vars and API responses |
| `dotenv` | ^17.4.1 | `.env` file loading |

### Dev Dependencies

| Package | Purpose |
|---|---|
| `typescript` | TypeScript compiler |
| `tsx` | Run TypeScript directly (dev mode) |
| `pino-pretty` | Human-readable log formatting in dev |
| `@types/better-sqlite3` | Type definitions |
| `@types/express` | Type definitions |
| `@types/ws` | Type definitions |
| `@types/node-cron` | Type definitions |
| `@types/node` | Node.js type definitions |

### Prerequisites

- Node.js 18+
- npm

---

## Project Structure

```
fankave/
├── index.ts                          # Entry point — wires Express, WebSocket, DB, scheduler
├── src/
│   ├── config/
│   │   ├── env.ts                    # Zod-validated environment variables
│   │   └── constants.ts              # MAX_BATCH_SIZE, retry config, checkpoint key
│   ├── types/
│   │   ├── api.ts                    # Zod schema for EventsCloud API response
│   │   └── domain.ts                 # Scan, PlayerScanCount, WsMessage interfaces
│   ├── db/
│   │   └── client.ts                 # SQLite singleton + auto-migrations on startup
│   ├── repositories/
│   │   ├── scan.repository.ts        # INSERT OR IGNORE into scans table
│   │   ├── player.repository.ts      # UPSERT player scan counts
│   │   └── checkpoint.repository.ts  # Read/write polling checkpoint
│   ├── services/
│   │   ├── poller.service.ts         # Fetches API, paginates through all pages
│   │   └── scan.service.ts           # Validates, persists, broadcasts per poll cycle
│   ├── scheduler/
│   │   └── index.ts                  # node-cron setup, runs immediately on startup
│   ├── websocket/
│   │   ├── server.ts                 # ws.Server attached to Express HTTP server
│   │   └── broadcaster.ts            # Sends player count updates to all WS clients
│   ├── api/routes/
│   │   ├── health.ts                 # GET /health
│   │   └── players.ts                # GET /players
│   └── utils/
│       ├── logger.ts                 # Pino logger (pretty in dev, JSON in prod)
│       └── retry.ts                  # retryWithBackoff<T> with exponential backoff
├── .env.example
├── .gitignore
├── package.json
└── tsconfig.json
```

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```ini
PORT=3000
API_URL=https://portal.eventscloud.com/api/scan
API_TOKEN=your_token_here                      # required
EVENT_START_DATE=2026-02-09T00:00:00.000Z      # fallback if no checkpoint in DB
POLL_INTERVAL_CRON=*/5 * * * *                 # every 5 minutes
DB_PATH=./fankave.db
LOG_LEVEL=info                                 # fatal | error | warn | info | debug | trace
```

> `API_TOKEN` is the only required variable. All others have defaults.

### 3. Run

**Development** (auto-restarts on file changes):

```bash
npm run dev
```

**Production**:

```bash
npm run build
npm start
```

> The SQLite database file is created automatically on first launch — no manual migration step needed.

---

## REST API

Base URL: `http://localhost:3000`

### `GET /health`

Liveness check.

**Response:**

```json
{
  "ok": true,
  "ts": "2026-02-09T10:36:55.000Z"
}
```

---

### `GET /players`

Returns all players sorted by scan count (highest first).

**Response:**

```json
{
  "players": [
    {
      "badgeId": "SYNTHETIC_BADGE_ID",
      "scanCount": 5,
      "lastScanDate": "2026-02-09T10:36:55"
    }
  ],
  "total": 42
}
```

---

### `GET /players/top`

Returns the player with the **maximum** number of scans.

**Response:**

```json
{
  "player": {
    "badgeId": "SYNTHETIC_BADGE_ID",
    "scanCount": 6,
    "lastScanDate": "2026-02-09T10:24:10"
  }
}
```

---

### `GET /players/bottom`

Returns the player with the **minimum** number of scans.

**Response:**

```json
{
  "player": {
    "badgeId": "SYNTHETIC_BADGE_ID",
    "scanCount": 1,
    "lastScanDate": "2026-02-09T08:13:26"
  }
}
```

---

### `GET /players/:badgeId`

Returns the scan count and full booth visit history for a specific player.

**Example:** `GET /players/SYNTHETIC_BADGE_ID`

**Response:**

```json
{
  "badgeId": "SYNTHETIC_BADGE_ID",
  "scanCount": 3,
  "lastScanDate": "2026-02-09T10:36:55",
  "scans": [
    { "boothName": "Cisco Showcase", "scanDate": "2026-02-09T08:13:26" },
    { "boothName": "Splunk Café",    "scanDate": "2026-02-09T09:05:10" }
  ]
}
```

Returns `404` if the `badgeId` is not found.

---

### `GET /scans`

Search and filter scan records. All query parameters are optional and can be combined.

| Query param | Description | Example |
|---|---|---|
| `badgeId` | Exact match on player badge ID | `?badgeId=SYNTHETIC_BADGE_ID` |
| `boothName` | Partial, case-insensitive match on booth name | `?boothName=cisco` |
| `scanDate` | Prefix match — filter by date or datetime | `?scanDate=2026-02-09` |
| `limit` | Max results to return (default `50`, max `500`) | `?limit=100` |
| `offset` | Pagination offset (default `0`) | `?offset=50` |

**Examples:**

```
GET /scans                                         → first 50 scans
GET /scans?badgeId=SYNTHETIC_BADGE_ID            → all scans for a player
GET /scans?boothName=cisco                         → all scans at Cisco booths
GET /scans?scanDate=2026-02-09                     → all scans on Feb 9
GET /scans?scanDate=2026-02-09T10                  → all scans in the 10am hour
GET /scans?boothName=splunk&scanDate=2026-02-09    → Splunk scans on Feb 9
GET /scans?limit=100&offset=100                    → second page of 100
```

**Response:**

```json
{
  "scans": [
    {
      "badgeId": "SYNTHETIC_BADGE_ID",
      "boothName": "Cisco Showcase",
      "scanDate": "2026-02-09T08:13:26"
    }
  ],
  "total": 946,
  "limit": 50,
  "offset": 0
}
```

---

## WebSocket API

Connect to `ws://localhost:3000` using any WebSocket client.

### On connect — snapshot

Immediately upon connection, the server sends the full current state:

```json
{
  "type": "snapshot",
  "players": [
    { "badgeId": "...", "scanCount": 5, "lastScanDate": "..." }
  ]
}
```

### On poll completion — live update

After every successful poll cycle (or page within a cycle), the server broadcasts:

```json
{
  "type": "update",
  "players": [
    { "badgeId": "...", "scanCount": 6, "lastScanDate": "..." }
  ]
}
```

**Example (browser):**

```javascript
const ws = new WebSocket("ws://localhost:3000");
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === "snapshot" || msg.type === "update") {
    console.table(msg.players);
  }
};
```

---

## Database

SQLite file at `DB_PATH` (default: `./fankave.db`). Three tables:

| Table | Purpose |
|---|---|
| `scans` | Raw scan records — `UNIQUE(badge_id, scan_date)` prevents duplicates |
| `player_scan_counts` | Materialised per-player count, updated atomically with each new scan |
| `checkpoints` | Stores the `last_scan_date` cursor so polling resumes after restarts |

To inspect with the SQLite CLI:

```bash
sqlite3 fankave.db
sqlite> SELECT * FROM player_scan_counts ORDER BY scan_count DESC;
sqlite> SELECT * FROM checkpoints;
sqlite> SELECT * FROM scans WHERE badge_id = 'SYNTHETIC_BADGE_ID';
```

To browse with a GUI, open `fankave.db` in [DB Browser for SQLite](https://sqlitebrowser.org), [TablePlus](https://tableplus.com), or the **SQLite Viewer** VS Code extension.

---

## How It Works

```
Startup
  └─ DB opens + auto-migrates (CREATE TABLE IF NOT EXISTS)
  └─ HTTP + WebSocket server starts on PORT
  └─ Poll cycle runs immediately, then repeats on POLL_INTERVAL_CRON

Poll Cycle
  └─ Read last checkpoint from DB (falls back to EVENT_START_DATE)
  └─ Loop:
      ├─ POST /api/scan?scanDateGT=<checkpoint>  (with retry + backoff)
      ├─ Filter: only records where customFields[0]["Booth Name"] is non-empty
      ├─ SQLite transaction:
      │    INSERT OR IGNORE into scans
      │    UPSERT player_scan_counts (increment count)
      │    UPDATE checkpoint to max(scanDate) in batch
      ├─ Broadcast updated player counts to all connected WS clients
      └─ If batch = 1000 records → advance cursor and fetch next page
         If batch < 1000 records → done until next scheduled tick
```

### Reliability Guarantees

| Concern | Mechanism |
|---|---|
| No missed scans | Checkpoint only advances inside the same DB transaction as scan inserts |
| No duplicate scans | `UNIQUE(badge_id, scan_date)` + `INSERT OR IGNORE` |
| API page limit (1000/page) | Automatic transparent pagination within a single poll tick |
| API failures | 3 retries with exponential backoff (1 s → 2 s → 4 s); failed cycle resumes from last checkpoint on next tick |
| Safe restart after crash | Checkpoint persisted in SQLite; next run resumes from last committed position |
| Overlapping poll ticks | In-memory `isRunning` guard skips a tick if the previous one hasn't finished |

---

## Environment Variable Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `API_TOKEN` | **Yes** | — | EventsCloud API auth token |
| `PORT` | No | `3000` | HTTP server port |
| `API_URL` | No | EventsCloud scan endpoint | Full URL to the scan API |
| `EVENT_START_DATE` | No | Unix epoch | Fallback scan start date when no checkpoint exists (ISO 8601) |
| `POLL_INTERVAL_CRON` | No | `*/5 * * * *` | Cron expression controlling polling frequency |
| `DB_PATH` | No | `./fankave.db` | Path to the SQLite database file |
| `LOG_LEVEL` | No | `info` | Pino log level (`fatal` `error` `warn` `info` `debug` `trace`) |
