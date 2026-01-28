import { Extracted } from "./models.js";

function findNumber(patterns: RegExp[], text: string): number | undefined {
  for (const p of patterns) {
    const m = p.exec(text);
    if (m) {
      const n = Number(m[1]);
      if (!Number.isNaN(n)) return Math.max(0, Math.min(10, Math.round(n)));
    }
  }
}

export function extractFromText(raw: string): Extracted {
  const text = raw.toLowerCase();
  const rpe = findNumber([/rpe\s*[:=]?\s*(\d{1,2})/, /(\d)\s*\/\s*10\s*\b/, /ressenti\s*(\d)\/10/], text);
  const stress = findNumber([/stress\s*[:=]?\s*(\d{1,2})/, /stress\s*(\d)\/10/], text);
  const sleep_quality = findNumber([/sommeil\s*[:=]?\s*(\d{1,2})/, /sleep\s*[:=]?\s*(\d{1,2})/], text);

  let social: Extracted["social_context"] = undefined;
  if (/seul|solo|seule/.test(text)) social = "solo";
  else if (/couple|partenaire/.test(text)) social = "couple";
  else if (/amis|ami|copain|copine/.test(text)) social = "amis";
  else if (/club|groupe/.test(text)) social = "club";
  else social = "unknown";

  const pain: Array<{ area: string; intensity: number; type?: string }> = [];
  const painAreas = ["mollet", "genou", "tibia", "tendon", "fesse", "dos", "cheville", "épaule", "épaule"];
  for (const area of painAreas) {
    const re = new RegExp(`${area}[^\n\.,;]*(?:\b(\d)\/10|[:= ](\d)\b)?`, "i");
    const m = re.exec(raw);
    if (m) {
      const num = m[1] || m[2];
      const intensity = num ? Math.max(0, Math.min(10, Number(num))) : 0;
      pain.push({ area, intensity, type: undefined });
    }
  }

  const extracted: Extracted = {
    rpe: rpe ?? undefined,
    stress: stress ?? undefined,
    sleep_quality: sleep_quality ?? undefined,
    social_context: social,
    pain: pain.length ? pain : undefined,
    raw_text: raw
  } as Extracted;

  return extracted;
}
