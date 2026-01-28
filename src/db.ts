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

// Initialize tables
db.exec(`
PRAGMA journal_mode = WAL;
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
