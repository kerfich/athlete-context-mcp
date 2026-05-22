import path from "path";
import fs from "fs";
import os from "os";
import Database from "better-sqlite3";

function getDataDir(): string {
  if (process.env.ATHLETE_MCP_DATA_DIR) {
    return process.env.ATHLETE_MCP_DATA_DIR;
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "athlete-context-mcp");
  }
  return path.join(os.homedir(), ".athlete-context-mcp");
}

const DATA_DIR = getDataDir();

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (process.env.MCP_DEBUG === "1") {
  process.stderr.write(`[athlete-context-mcp] Data directory: ${DATA_DIR}\n`);
}

const DB_PATH = path.join(DATA_DIR, "athlete.db");

const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.pragma("busy_timeout = 5000");
db.pragma("locking_mode = NORMAL");
db.pragma("wal_autocheckpoint = 1000");

if (process.env.MCP_DEBUG === "1") {
  process.stderr.write("[athlete-context-mcp] SQLite: WAL enabled, busy_timeout=5000ms\n");
}

// Create tables
db.exec(`
CREATE TABLE IF NOT EXISTS versions_profile (id INTEGER PRIMARY KEY, version INTEGER, json TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS versions_goals (id INTEGER PRIMARY KEY, version INTEGER, json TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS versions_policies (id INTEGER PRIMARY KEY, version INTEGER, json TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS versions_state (id INTEGER PRIMARY KEY, version INTEGER, json TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id TEXT,
  note_date TEXT,
  raw_text TEXT,
  tags_json TEXT,
  extracted_json TEXT,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS sleep_log (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  date              TEXT UNIQUE NOT NULL,
  duration_min      INTEGER,
  score             INTEGER,
  hrv_avg_ms        REAL,
  hrv_status        TEXT,
  hrv_baseline_low  REAL,
  hrv_baseline_high REAL,
  resting_hr_bpm    INTEGER,
  deep_pct          REAL,
  rem_pct           REAL,
  light_pct         REAL,
  awake_min         INTEGER,
  qualifier         TEXT,
  created_at        TEXT,
  updated_at        TEXT
);
`);

// Migrations (safe to run on existing DB)
try {
  db.exec("ALTER TABLE notes ADD COLUMN type TEXT");
} catch (_) {
  // Column already exists — ignore
}

export default db;

export function nowISO() {
  return new Date().toISOString();
}

export function withRetry<T>(fn: () => T, maxRetries = 5): T {
  const backoffs = [50, 100, 200, 300, 500];
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return fn();
    } catch (err: any) {
      if (
        err?.code === "SQLITE_BUSY" ||
        err?.code === "SQLITE_LOCKED" ||
        (typeof err?.message === "string" &&
          (err.message.includes("database is locked") ||
            err.message.includes("SQLITE_BUSY") ||
            err.message.includes("SQLITE_LOCKED")))
      ) {
        lastError = err;
        if (attempt < maxRetries - 1) {
          const backoff = backoffs[Math.min(attempt, backoffs.length - 1)];
          if (process.env.MCP_DEBUG === "1") {
            process.stderr.write(
              `[athlete-context-mcp] Database locked (attempt ${attempt + 1}/${maxRetries}), retrying in ${backoff}ms...\n`
            );
          }
          const now = Date.now();
          while (Date.now() - now < backoff) { /* busy-wait */ }
        }
      } else {
        throw err;
      }
    }
  }

  throw new Error(
    `Database operation failed after ${maxRetries} retries: ${lastError?.message ?? "SQLITE_BUSY/SQLITE_LOCKED"}`
  );
}
