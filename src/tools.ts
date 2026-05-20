import db, { nowISO, withRetry } from "./db.js";
import { z } from "zod";
import { NoteInput, SubjectiveStateInput } from "./models.js";
import { extractFromText as extractor } from "./extractor.js";
import { computeState } from "./state.js";

function getVersioned(table: string) {
  const row = db
    .prepare(`SELECT version, json, updated_at FROM ${table} WHERE id = 1`)
    .get() as any;
  if (!row) return null;
  return {
    version: row.version as number,
    updated_at: row.updated_at as string,
    data: JSON.parse(row.json as string),
  };
}

function upsertVersioned(table: string, jsonObj: any) {
  return withRetry(() => {
    const now = nowISO();
    const existing = db.prepare(`SELECT version FROM ${table} WHERE id = 1`).get() as any;
    if (existing) {
      const newv = (existing.version as number) + 1;
      db.prepare(`UPDATE ${table} SET version = ?, json = ?, updated_at = ? WHERE id = 1`).run(
        newv,
        JSON.stringify(jsonObj),
        now
      );
      return { ok: true, version: newv, updated_at: now };
    } else {
      db.prepare(
        `INSERT INTO ${table} (id, version, json, updated_at) VALUES (1, 1, ?, ?)`
      ).run(JSON.stringify(jsonObj), now);
      return { ok: true, version: 1, updated_at: now };
    }
  });
}

export const get_profile = () => getVersioned("versions_profile");
export const upsert_profile = (profile: any) => upsertVersioned("versions_profile", profile);

export const get_goals = () => getVersioned("versions_goals");
export const upsert_goals = (goals: any) => upsertVersioned("versions_goals", goals);

export const get_policies = () => getVersioned("versions_policies");
export const upsert_policies = (policies: any) => upsertVersioned("versions_policies", policies);

export function add_note(input: z.infer<typeof NoteInput>) {
  if (!input?.note_text || typeof input.note_text !== "string") {
    throw new Error("add_note requires a non-empty 'note_text' string");
  }
  return withRetry(() => {
    const now = nowISO();
    const extracted = extractor(input.note_text);
    const note_date = input.note_date ?? now.split("T")[0];
    const activity_id = input.activity_id ?? null;
    const type = input.type ?? null;
    const tags_json = input.tags ? JSON.stringify(input.tags) : null;

    const res = db
      .prepare(
        "INSERT INTO notes (activity_id, note_date, type, raw_text, tags_json, extracted_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .run(activity_id, note_date, type, input.note_text, tags_json, JSON.stringify(extracted), now);

    return {
      note_id: Number(res.lastInsertRowid),
      activity_id,
      note_date,
      type,
      tags: input.tags ?? [],
      extracted,
      created_at: now,
    };
  });
}

export function get_note(note_id: number) {
  const row = db.prepare("SELECT * FROM notes WHERE id = ?").get(note_id) as any;
  if (!row) return null;
  return {
    ...row,
    extracted: JSON.parse(row.extracted_json || "{}"),
    tags: row.tags_json ? JSON.parse(row.tags_json) : [],
  };
}

export function search_notes(params: {
  query?: string;
  date_from?: string;
  date_to?: string;
  type?: string;
  tags?: string[];
  limit?: number;
}) {
  let sql = "SELECT * FROM notes WHERE 1 = 1";
  const binds: any[] = [];

  if (params.query) {
    sql += " AND raw_text LIKE ?";
    binds.push(`%${params.query}%`);
  }
  if (params.date_from) {
    sql += " AND note_date >= ?";
    binds.push(params.date_from);
  }
  if (params.date_to) {
    sql += " AND note_date <= ?";
    binds.push(params.date_to);
  }
  if (params.type) {
    sql += " AND type = ?";
    binds.push(params.type);
  }

  sql += " ORDER BY note_date DESC, created_at DESC LIMIT ?";
  binds.push(params.limit ?? 10);

  const rows = db.prepare(sql).all(...binds) as any[];
  let result = rows.map((r) => ({
    ...r,
    extracted: JSON.parse(r.extracted_json || "{}"),
    tags: r.tags_json ? JSON.parse(r.tags_json) : [],
  }));

  // Tags filter in memory (JSON array, no SQL index)
  if (params.tags && params.tags.length > 0) {
    const filterTags = params.tags;
    result = result.filter((r) => filterTags.some((t) => r.tags.includes(t)));
  }

  return result;
}

export function get_state() {
  const row = db
    .prepare("SELECT json, version, updated_at FROM versions_state WHERE id = 1")
    .get() as any;
  if (!row) return null;
  return {
    version: row.version as number,
    updated_at: row.updated_at as string,
    state: JSON.parse(row.json as string),
  };
}

export function update_state(subjective: z.infer<typeof SubjectiveStateInput>) {
  return withRetry(() => {
    const computed = computeState();
    const combined = { computed, subjective };
    const now = nowISO();
    const existing = db.prepare("SELECT version FROM versions_state WHERE id = 1").get() as any;
    if (existing) {
      const newv = (existing.version as number) + 1;
      db.prepare(
        "UPDATE versions_state SET version = ?, json = ?, updated_at = ? WHERE id = 1"
      ).run(newv, JSON.stringify(combined), now);
      return { ok: true, version: newv, updated_at: now, state: combined };
    } else {
      db.prepare(
        "INSERT INTO versions_state (id, version, json, updated_at) VALUES (1, 1, ?, ?)"
      ).run(JSON.stringify(combined), now);
      return { ok: true, version: 1, updated_at: now, state: combined };
    }
  });
}

export function get_context() {
  return {
    profile: get_profile(),
    goals: get_goals(),
    policies: get_policies(),
    state: get_state(),
    recent_notes: search_notes({ limit: 3 }),
  };
}
