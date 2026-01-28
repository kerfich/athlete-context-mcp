import db, { nowISO } from "./db.js";
import { z } from "zod";
import { NoteInput } from "./models.js";
import { extractFromText as extractor } from "./extractor.js";
import { computeState } from "./state.js";

// Helper for versioned upsert/get
function getVersioned(table: string) {
  const row = db.prepare(`SELECT version,json,updated_at FROM ${table} WHERE id=1`).get();
  if (!row) return null;
  return { version: row.version, updated_at: row.updated_at, data: JSON.parse(row.json) };
}

function upsertVersioned(table: string, jsonObj: any) {
  const now = nowISO();
  const existing = db.prepare(`SELECT version FROM ${table} WHERE id=1`).get();
  if (existing) {
    const newv = existing.version + 1;
    db.prepare(`UPDATE ${table} SET version=?, json=?, updated_at=? WHERE id=1`).run(newv, JSON.stringify(jsonObj), now);
    return { ok: true, version: newv, updated_at: now };
  } else {
    db.prepare(`INSERT INTO ${table} (id,version,json,updated_at) VALUES (1,1,?,?)`).run(JSON.stringify(jsonObj), now);
    return { ok: true, version: 1, updated_at: now };
  }
}

// Tools implementations
export const get_profile = () => getVersioned('versions_profile');
export const upsert_profile = (profile: any) => upsertVersioned('versions_profile', profile);
export const get_goals = () => getVersioned('versions_goals');
export const upsert_goals = (goals: any) => upsertVersioned('versions_goals', goals);
export const get_policies = () => getVersioned('versions_policies');
export const upsert_policies = (policies: any) => upsertVersioned('versions_policies', policies);

export function add_note(input: z.infer<typeof NoteInput>) {
  const now = nowISO();
  const extracted = extractor(input.note_text);
  const tags_json = input.tags ? JSON.stringify(input.tags) : null;
  const note_date = input.note_date || now.split('T')[0];
  const res = db.prepare('INSERT INTO notes (activity_id,note_date,raw_text,tags_json,extracted_json,created_at) VALUES (?,?,?,?,?,?)')
    .run(String(input.activity_id), note_date, input.note_text, tags_json, JSON.stringify(extracted), now);
  return { note_id: res.lastInsertRowid, activity_id: String(input.activity_id), extracted, created_at: now };
}

export function get_note(activity_id: string) {
  const row = db.prepare('SELECT * FROM notes WHERE activity_id = ? ORDER BY id DESC LIMIT 1').get(String(activity_id));
  if (!row) return null;
  return { ...row, extracted: JSON.parse(row.extracted_json || '{}'), tags: row.tags_json ? JSON.parse(row.tags_json) : [] };
}

export function search_notes(query: string, since?: string, until?: string, limit = 50) {
  let sql = 'SELECT * FROM notes WHERE raw_text LIKE ?';
  const params: any[] = [`%${query}%`];
  if (since) { sql += ' AND created_at >= ?'; params.push(since); }
  if (until) { sql += ' AND created_at <= ?'; params.push(until); }
  sql += ' ORDER BY created_at DESC LIMIT ?'; params.push(limit);
  const rows = db.prepare(sql).all(...params);
  return rows.map((r:any)=>({ ...r, extracted: JSON.parse(r.extracted_json||'{}'), tags: r.tags_json ? JSON.parse(r.tags_json) : [] }));
}

export function get_state() {
  const row = db.prepare('SELECT json,version,updated_at FROM versions_state WHERE id=1').get();
  if (!row) return null;
  return { state: JSON.parse(row.json), version: row.version, updated_at: row.updated_at };
}

export function update_state(options?: { since?: string }) {
  const state = computeState();
  const row = db.prepare('SELECT version,updated_at FROM versions_state WHERE id=1').get();
  const version = row ? row.version : 1;
  const updated_at = row ? row.updated_at : nowISO();
  return { ok: true, version, updated_at, state };
}
