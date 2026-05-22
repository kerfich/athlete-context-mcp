import db, { nowISO, withRetry } from "./db.js";
import { z } from "zod";
import { NoteInput, SubjectiveStateInput, SleepLogEntry } from "./models.js";
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

// ── Sleep log ────────────────────────────────────────────────────────────────

export function upsert_sleep_log(entry: SleepLogEntry) {
  return withRetry(() => {
    const now = nowISO();
    db.prepare(`
      INSERT INTO sleep_log
        (date, duration_min, score, hrv_avg_ms, hrv_status,
         hrv_baseline_low, hrv_baseline_high, resting_hr_bpm,
         deep_pct, rem_pct, light_pct, awake_min, qualifier,
         created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET
        duration_min      = excluded.duration_min,
        score             = excluded.score,
        hrv_avg_ms        = excluded.hrv_avg_ms,
        hrv_status        = excluded.hrv_status,
        hrv_baseline_low  = excluded.hrv_baseline_low,
        hrv_baseline_high = excluded.hrv_baseline_high,
        resting_hr_bpm    = excluded.resting_hr_bpm,
        deep_pct          = excluded.deep_pct,
        rem_pct           = excluded.rem_pct,
        light_pct         = excluded.light_pct,
        awake_min         = excluded.awake_min,
        qualifier         = excluded.qualifier,
        updated_at        = excluded.updated_at
    `).run(
      entry.date,
      entry.duration_min   ?? null,
      entry.score          ?? null,
      entry.hrv_avg_ms     ?? null,
      entry.hrv_status     ?? null,
      entry.hrv_baseline_low  ?? null,
      entry.hrv_baseline_high ?? null,
      entry.resting_hr_bpm ?? null,
      entry.deep_pct       ?? null,
      entry.rem_pct        ?? null,
      entry.light_pct      ?? null,
      entry.awake_min      ?? null,
      entry.qualifier      ?? null,
      now, now
    );
    return { ok: true, date: entry.date, updated_at: now };
  });
}

export function get_sleep_trends(days = 14) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split("T")[0];

  const entries = db
    .prepare("SELECT * FROM sleep_log WHERE date >= ? ORDER BY date DESC")
    .all(sinceStr) as any[];

  // ── helpers ──────────────────────────────────────────────────────────────
  const avg = (arr: number[]): number | null =>
    arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

  const nonNull = <T>(arr: (T | null | undefined)[]): T[] =>
    arr.filter((v): v is T => v != null);

  // ── window over last 7 entries ────────────────────────────────────────────
  const last7 = entries.slice(0, 7);

  // unbalanced_streak: consecutive entries from most recent with hrv_status != 'balanced'
  let unbalanced_streak = 0;
  for (const r of entries) {
    if (r.hrv_status === "unbalanced" || r.hrv_status === "low") {
      unbalanced_streak++;
    } else {
      break;
    }
  }

  // sleep_debt_7d_min: cumulative deficit vs 7 h/night target over last 7 nights
  const TARGET_MIN = 420;
  const sleep_debt_7d_min = last7.reduce((sum: number, r: any) => {
    return r.duration_min != null ? sum + (TARGET_MIN - r.duration_min) : sum;
  }, 0);

  // averages
  const durations7 = nonNull(last7.map((r: any) => r.duration_min as number | null));
  const scores7    = nonNull(last7.map((r: any) => r.score as number | null));
  const hrv7       = nonNull(last7.map((r: any) => r.hrv_avg_ms as number | null));

  // hrv_trend: compare average of 3 most recent nights vs 3 preceding nights
  const hrv_trend = (() => {
    if (hrv7.length < 4) return "insufficient_data";
    const recent = avg(hrv7.slice(0, 3))!;
    const older  = avg(hrv7.slice(3, 6))!;
    if (recent > older + 3) return "improving";
    if (recent < older - 3) return "declining";
    return "stable";
  })();

  // qualifier distribution over last 7 nights
  const qualifier_dist_7d: Record<string, number> = { poor: 0, fair: 0, good: 0, excellent: 0 };
  for (const r of last7) {
    if (r.qualifier && r.qualifier in qualifier_dist_7d) {
      qualifier_dist_7d[r.qualifier]++;
    }
  }

  const round1 = (n: number | null) => n !== null ? Math.round(n * 10) / 10 : null;

  return {
    period_days: days,
    entries,
    trends: {
      unbalanced_streak,
      sleep_debt_7d_min: Math.round(sleep_debt_7d_min),
      avg_duration_7d_min: avg(durations7) !== null ? Math.round(avg(durations7)!) : null,
      avg_score_7d:        avg(scores7)    !== null ? Math.round(avg(scores7)!)    : null,
      hrv_avg_7d:          round1(avg(hrv7)),
      hrv_trend,
      qualifier_dist_7d,
    },
  };
}

// ── Bootstrap ────────────────────────────────────────────────────────────────

export function get_context() {
  return {
    profile:      get_profile(),
    goals:        get_goals(),
    policies:     get_policies(),
    state:        get_state(),
    recent_notes: search_notes({ limit: 3 }),
    sleep:        get_sleep_trends(7),
  };
}
