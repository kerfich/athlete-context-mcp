import db, { nowISO } from "./db.js";
import { AthleteState, Extracted } from "./models.js";

function avg(nums: number[]) { return nums.length ? nums.reduce((a,b)=>a+b,0)/nums.length : undefined; }

export function computeState(sinceDays = 14): AthleteState {
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - sinceDays);
  const sinceISO = sinceDate.toISOString();

  const rows = db.prepare('SELECT * FROM notes WHERE created_at >= ? ORDER BY created_at DESC').all(sinceISO);
  const extractedList: Extracted[] = rows.map((r: any) => JSON.parse(r.extracted_json || '{}'));

  const nowDate = new Date();
  // compute 7d trends
  const date7 = new Date(); date7.setDate(nowDate.getDate() - 7);
  const rows7 = rows.filter((r: any) => new Date(r.created_at) >= date7);
  const ext7 = rows7.map((r: any) => JSON.parse(r.extracted_json || '{}'));

  const stress_vals = ext7.map((e:any)=>e?.stress).filter((v:any)=>typeof v==='number');
  const rpe_vals = ext7.map((e:any)=>e?.rpe).filter((v:any)=>typeof v==='number');

  const stress_trend_7d = avg(stress_vals) ?? undefined;
  const rpe_trend_7d = avg(rpe_vals) ?? undefined;

  // pain watchlist top areas over 14d
  const painCounts: Record<string,{occ:number,sum:number}> = {};
  for (const e of extractedList) {
    if (!e || !e.pain) continue;
    for (const p of e.pain) {
      if (!painCounts[p.area]) painCounts[p.area] = {occ:0,sum:0};
      painCounts[p.area].occ += 1;
      painCounts[p.area].sum += (p.intensity||0);
    }
  }
  const watch = Object.entries(painCounts)
    .map(([area,v])=>({area, occurrences:v.occ, avg_intensity: v.sum / v.occ}))
    .sort((a,b)=>b.occurrences - a.occurrences)
    .slice(0,3);

  // solo ratio over 14d
  const soloCount = extractedList.filter(e=>e?.social_context==='solo').length;
  const solo_ratio_14d = extractedList.length ? soloCount / extractedList.length : undefined;

  // readiness simple formula
  const stress = extractedList.map(e=>e?.stress).filter(v=>typeof v==='number');
  const rpe = extractedList.map(e=>e?.rpe).filter(v=>typeof v==='number');
  const pain_max = extractedList.flatMap(e=>e?.pain ?? []).reduce((m:any,p:any)=>Math.max(m,p.intensity||0),0);
  const avgStress = avg(stress) ?? 0;
  const avgRpe = avg(rpe) ?? 0;
  let readiness = 100 - 5*avgStress - 3*avgRpe - 8*(pain_max||0);
  readiness = Math.max(0, Math.min(100, Math.round(readiness)));

  const flags: string[] = [];
  if ((avgStress ?? 0) >= 7) flags.push('high_stress');
  if ((pain_max||0) >= 5) flags.push('pain_risk');

  const state: AthleteState = {
    stress_trend_7d: stress_trend_7d === undefined ? undefined : Number((stress_trend_7d).toFixed(2)),
    rpe_trend_7d: rpe_trend_7d === undefined ? undefined : Number((rpe_trend_7d).toFixed(2)),
    pain_watchlist: watch,
    solo_ratio_14d: solo_ratio_14d === undefined ? undefined : Number((solo_ratio_14d).toFixed(3)),
    readiness_subjective: readiness,
    flags
  };

  // persist versions_state (upsert id=1)
  const ts = nowISO();
  const existing = db.prepare('SELECT version FROM versions_state WHERE id=1').get();
  if (existing) {
    const newv = existing.version + 1;
    db.prepare('UPDATE versions_state SET version=?, json=?, updated_at=? WHERE id=1').run(newv, JSON.stringify(state), ts);
  } else {
    db.prepare('INSERT INTO versions_state (id,version,json,updated_at) VALUES (1,1,?,?)').run(JSON.stringify(state), ts);
  }

  return state;
}
