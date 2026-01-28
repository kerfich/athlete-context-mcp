import path from "path";
import fs from "fs";
import os from "os";
import Database from "better-sqlite3";

// Resolve data directory with priority: env var > macOS Application Support > home dir
function getDataDir(): string {
  // 1. Check environment variable
  if (process.env.ATHLETE_MCP_DATA_DIR) {
    return process.env.ATHLETE_MCP_DATA_DIR;
  }

  // 2. macOS: ~/Library/Application Support/athlete-context-mcp
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "athlete-context-mcp");
  }

  // 3. Default: ~/.athlete-context-mcp
  return path.join(os.homedir(), ".athlete-context-mcp");
}

const DATA_DIR = getDataDir();

// Create data directory if it doesn't exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Log data directory in debug mode
if (process.env.MCP_DEBUG === "1") {
  process.stderr.write(`[athlete-context-mcp] Data directory: ${DATA_DIR}\n`);
}

const DB_PATH = path.join(DATA_DIR, "athlete.db");

const db = new Database(DB_PATH);

// SQLite robustness configuration for multi-instance support
db.pragma("journal_mode = WAL");           // Write-Ahead Logging for concurrent reads
db.pragma("synchronous = NORMAL");         // Balance durability/performance
db.pragma("busy_timeout = 5000");          // Wait up to 5s if database locked
db.pragma("locking_mode = NORMAL");        // Allow multiple readers
db.pragma("wal_autocheckpoint = 1000");    // Checkpoint after 1000 pages

if (process.env.MCP_DEBUG === "1") {
  process.stderr.write("[athlete-context-mcp] SQLite: WAL enabled, busy_timeout=5000ms\n");
}

// Initialize tables
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
`);

export default db;

export function nowISO() {
  return new Date().toISOString();
}

// Retry strategy for write operations that might encounter SQLITE_BUSY/SQLITE_LOCKED
export function withRetry<T>(fn: () => T, maxRetries = 5): T {
  const backoffs = [50, 100, 200, 300, 500]; // milliseconds
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return fn();
    } catch (err: any) {
      // Check if it's a SQLite locking error
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
              `[athlete-context-mcp] Database locked (attempt ${attempt + 1}/${maxRetries}), ` +
              `retrying in ${backoff}ms...\n`
            );
          }
          // Sleep for backoff
          const now = Date.now();
          while (Date.now() - now < backoff) {
            // Busy-wait (acceptable for short times, otherwise use setTimeout with async)
          }
        }
      } else {
        // Not a locking error, throw immediately
        throw err;
      }
    }
  }

  // All retries exhausted
  throw new Error(
    `Database operation failed after ${maxRetries} retries: ${lastError?.message || "SQLITE_BUSY/SQLITE_LOCKED"}`
  );
}
