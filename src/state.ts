import db from "./db.js";
import { AthleteState, Extracted } from "./models.js";

function avg(nums: number[]): number | undefined {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : undefined;
}

// Pure computation — does NOT persist. Caller is responsible for persistence.
export function computeState(sinceDays = 14): AthleteState {
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - sinceDays);
  const sinceISO = sinceDate.toISOString();

  const rows = db
    .prepare("SELECT * FROM notes WHERE created_at >= ? ORDER BY created_at DESC")
    .all(sinceISO);
  const extractedList: Extracted[] = rows.map((r: any) =>
    JSON.parse(r.extracted_json || "{}")
  );

  // 7-day trends
  const date7 = new Date();
  date7.setDate(date7.getDate() - 7);
  const rows7 = rows.filter((r: any) => new Date(r.created_at) >= date7);
  const ext7 = rows7.map((r: any) => JSON.parse(r.extracted_json || "{}"));

  const stress_vals = ext7.map((e: any) => e?.stress).filter((v: any) => typeof v === "number");
  const rpe_vals = ext7.map((e: any) => e?.rpe).filter((v: any) => typeof v === "number");

  const stress_trend_7d = avg(stress_vals);
  const rpe_trend_7d = avg(rpe_vals);

  // Pain watchlist over 14d
  const painCounts: Record<string, { occ: number; sum: number }> = {};
  for (const e of extractedList) {
    if (!e?.pain) continue;
    for (const p of e.pain) {
      if (!painCounts[p.area]) painCounts[p.area] = { occ: 0, sum: 0 };
      painCounts[p.area].occ += 1;
      painCounts[p.area].sum += p.intensity ?? 0;
    }
  }
  const pain_watchlist = Object.entries(painCounts)
    .map(([area, v]) => ({ area, occurrences: v.occ, avg_intensity: v.sum / v.occ }))
    .sort((a, b) => b.occurrences - a.occurrences)
    .slice(0, 3);

  // Solo ratio over 14d
  const soloCount = extractedList.filter((e) => e?.social_context === "solo").length;
  const solo_ratio_14d = extractedList.length ? soloCount / extractedList.length : undefined;

  // Simple readiness formula
  const stress = extractedList.map((e) => e?.stress).filter((v) => typeof v === "number") as number[];
  const rpe = extractedList.map((e) => e?.rpe).filter((v) => typeof v === "number") as number[];
  const pain_max = extractedList
    .flatMap((e) => e?.pain ?? [])
    .reduce((m, p) => Math.max(m, p.intensity ?? 0), 0);
  const avgStress = avg(stress) ?? 0;
  const avgRpe = avg(rpe) ?? 0;
  const readiness = Math.max(0, Math.min(100, Math.round(100 - 5 * avgStress - 3 * avgRpe - 8 * pain_max)));

  const flags: string[] = [];
  if (avgStress >= 7) flags.push("high_stress");
  if (pain_max >= 5) flags.push("pain_risk");

  return {
    stress_trend_7d: stress_trend_7d !== undefined ? Number(stress_trend_7d.toFixed(2)) : undefined,
    rpe_trend_7d: rpe_trend_7d !== undefined ? Number(rpe_trend_7d.toFixed(2)) : undefined,
    pain_watchlist,
    solo_ratio_14d: solo_ratio_14d !== undefined ? Number(solo_ratio_14d.toFixed(3)) : undefined,
    readiness_subjective: readiness,
    flags,
  };
}
