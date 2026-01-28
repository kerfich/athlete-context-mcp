import path from "path";
import fs from "fs";
import Database from "better-sqlite3";

const DATA_DIR = path.resolve(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
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
