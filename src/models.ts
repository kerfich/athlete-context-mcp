import { z } from "zod";

export const Identity = z.object({
  name: z.string().optional(),
  age: z.number().optional(),
  sex: z.string().optional()
});

export const TrainingPattern = z.object({
  running_sessions_per_week: z.number().int().nonnegative(),
  long_run_day: z.string(),
  swim_day: z.string().optional(),
  bike_day: z.string().optional(),
  rest_day: z.string().optional()
});

export const Injury = z.object({
  area: z.string(),
  description: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  severity: z.number().optional()
});

export const Preferences = z.object({ cross_training: z.boolean(), notes: z.string().optional() });

export const AthleteProfile = z.object({
  identity: Identity.optional(),
  training_pattern: TrainingPattern.optional(),
  injury_history: z.array(Injury).optional(),
  preferences: Preferences.optional(),
  constraints: z.array(z.string()).optional()
});

export type AthleteProfile = z.infer<typeof AthleteProfile>;

export const Event = z.object({
  name: z.string(),
  date: z.string(),
  discipline: z.union([z.literal("run"), z.literal("triathlon"), z.literal("swim"), z.literal("bike")]),
  priority: z.union([z.literal("A"), z.literal("B"), z.literal("C")]),
  target_time: z.string().optional(),
  notes: z.string().optional()
});

export const AthleteGoals = z.object({ events: z.array(Event), season_notes: z.string().optional() });
export type AthleteGoals = z.infer<typeof AthleteGoals>;

export const PolicyRule = z.object({
  id: z.string(),
  description: z.string(),
  condition: z.string().optional(),
  action: z.string().optional(),
  severity: z.union([z.literal("info"), z.literal("warn"), z.literal("block")])
});

export const AthletePolicies = z.object({ rules: z.array(PolicyRule) });
export type AthletePolicies = z.infer<typeof AthletePolicies>;

export const NoteInput = z.object({
  activity_id: z.union([z.string(), z.number()]).transform((v) => String(v)),
  note_text: z.string(),
  note_date: z.string().optional(),
  tags: z.array(z.string()).optional()
});

export const NoteRow = z.object({
  id: z.number().optional(),
  activity_id: z.string(),
  note_date: z.string().optional(),
  raw_text: z.string(),
  tags_json: z.string().optional(),
  extracted_json: z.string().optional(),
  created_at: z.string().optional()
});

export type Note = z.infer<typeof NoteRow>;

export const Extracted = z.object({
  rpe: z.number().int().min(1).max(10).optional(),
  stress: z.number().int().min(0).max(10).optional(),
  sleep_quality: z.number().int().min(0).max(10).optional(),
  social_context: z.union([z.literal("solo"), z.literal("couple"), z.literal("amis"), z.literal("club"), z.literal("unknown")]).optional(),
  pain: z.array(z.object({ area: z.string(), intensity: z.number().min(0).max(10), type: z.string().optional() })).optional(),
  raw_text: z.string()
});

export type Extracted = z.infer<typeof Extracted>;

export const AthleteState = z.object({
  stress_trend_7d: z.number().optional(),
  rpe_trend_7d: z.number().optional(),
  pain_watchlist: z.array(z.object({ area: z.string(), occurrences: z.number(), avg_intensity: z.number() })),
  solo_ratio_14d: z.number().optional(),
  readiness_subjective: z.number().min(0).max(100),
  flags: z.array(z.string())
});

export type AthleteState = z.infer<typeof AthleteState>;
