import { z } from "zod";

// --- Physiological zones ---

export const HRZone = z.object({
  zone: z.number().int().min(1).max(7),
  name: z.string().optional(),
  min_bpm: z.number().int().optional(),
  max_bpm: z.number().int().optional(),
});

export const PaceZone = z.object({
  zone: z.number().int().min(1).max(5),
  name: z.string().optional(),
  min_pace_per_km: z.string().optional().describe("Format mm:ss e.g. '5:30'"),
  max_pace_per_km: z.string().optional().describe("Format mm:ss e.g. '6:00'"),
});

export const BiomechanicsTargets = z.object({
  cadence_spm: z.number().optional().describe("Target steps per minute"),
  ground_contact_time_ms: z.number().optional().describe("Target GCT in ms"),
  vertical_oscillation_cm: z.number().optional().describe("Target vertical oscillation in cm"),
  vertical_ratio_pct: z.number().optional().describe("Target vertical ratio %"),
});

export const Injury = z.object({
  area: z.string().describe("Body area e.g. 'cheville gauche'"),
  description: z.string().optional(),
  start_date: z.string().optional().describe("ISO date YYYY-MM-DD"),
  end_date: z.string().optional().describe("ISO date YYYY-MM-DD, omit if ongoing"),
  severity: z.number().min(0).max(10).optional(),
});

export const TrainingPattern = z.object({
  sessions_per_week: z.number().int().nonnegative().optional(),
  long_run_day: z.string().optional(),
  swim_day: z.string().optional(),
  bike_day: z.string().optional(),
  rest_day: z.string().optional(),
});

// --- Equipment ---

export const Equipment = z.object({
  bike_name: z.string().optional().describe("e.g. 'Trek Domane AL5'"),
  shoes_run_name: z.string().optional().describe("Running shoe model"),
  wetsuit: z.boolean().optional(),
  power_meter: z.boolean().optional(),
  heart_rate_monitor: z.boolean().optional(),
  smart_trainer: z.boolean().optional(),
  swim_goggles: z.boolean().optional(),
  notes: z.string().optional().describe("Other equipment notes"),
});

// --- Schedule constraints ---

export const ScheduleConstraints = z.object({
  available_days: z
    .array(z.string())
    .optional()
    .describe("Days available for training e.g. ['lundi','mercredi','samedi']"),
  unavailable_days: z.array(z.string()).optional(),
  preferred_time: z
    .enum(["morning", "midday", "evening", "flexible"])
    .optional()
    .describe("Preferred training time of day"),
  max_session_duration_min: z
    .number()
    .int()
    .optional()
    .describe("Maximum session duration in minutes"),
  min_rest_days_per_week: z.number().int().min(0).max(7).optional(),
  notes: z.string().optional(),
});

// --- Session naming convention ---

export const SessionNamingConvention = z.object({
  format: z
    .string()
    .optional()
    .describe("Template e.g. '{date}_{discipline}_{type}_{duration}min'"),
  prefix: z.string().optional().describe("Fixed prefix e.g. 'TRI' or 'P0'"),
  date_format: z.string().optional().describe("e.g. 'YYYY-MM-DD'"),
  discipline_codes: z
    .record(z.string())
    .optional()
    .describe("Abbreviations e.g. {run:'CAP', bike:'VEL', swim:'NAT'}"),
  example: z.string().optional().describe("Concrete example of a generated name"),
  notes: z.string().optional(),
});

// --- Training volume targets ---

export const TrainingVolumeTargets = z.object({
  weekly_run_km: z.number().optional().describe("Target weekly run volume in km"),
  weekly_bike_km: z.number().optional().describe("Target weekly cycling volume in km"),
  weekly_swim_m: z.number().optional().describe("Target weekly swim volume in meters"),
  sessions_per_week_run: z.number().int().optional(),
  sessions_per_week_bike: z.number().int().optional(),
  sessions_per_week_swim: z.number().int().optional(),
  long_run_km: z.number().optional().describe("Target long run distance in km"),
  long_bike_km: z.number().optional().describe("Target long ride distance in km"),
  phase: z
    .string()
    .optional()
    .describe("Phase these targets apply to e.g. 'P0', 'P1'"),
  notes: z.string().optional(),
});

export const AthleteProfile = z.object({
  // Identity
  name: z.string().optional(),
  age: z.number().int().optional(),
  weight_kg: z.number().optional(),

  // Physiological markers
  hr_max: z.number().int().optional().describe("Max heart rate in bpm"),
  lthr_run: z.number().int().optional().describe("Lactate threshold HR for running in bpm"),
  ftp_bike_ref: z.number().int().optional().describe("Reference FTP on bike in watts"),
  ftp_bike_current: z.number().int().optional().describe("Current FTP on bike in watts"),

  // Training zones
  hr_zones_run: z.array(HRZone).optional().describe("7 HR zones for running"),
  hr_zones_bike: z.array(HRZone).optional().describe("7 HR zones for cycling"),
  pace_zones_run: z.array(PaceZone).optional().describe("5 pace zones for running"),

  // Biomechanics targets
  biomechanics_targets: BiomechanicsTargets.optional(),

  // Medical history
  injury_history: z.array(Injury).optional(),

  // Training pattern
  training_pattern: TrainingPattern.optional(),

  // Equipment
  equipment: Equipment.optional().describe("Available training equipment"),

  // Schedule constraints
  schedule_constraints: ScheduleConstraints.optional().describe(
    "Weekly planning constraints (available days, session duration, etc.)"
  ),

  // Session naming convention
  session_naming_convention: SessionNamingConvention.optional().describe(
    "Naming rules for training sessions"
  ),

  // Training volume targets
  training_volume_targets: TrainingVolumeTargets.optional().describe(
    "Target volumes and session frequency per discipline"
  ),

  // Notes / constraints
  constraints: z.array(z.string()).optional().describe("Free-form training constraints"),
});

export type AthleteProfile = z.infer<typeof AthleteProfile>;

// --- Goals ---

export const Event = z.object({
  name: z.string().describe("Event name e.g. 'Triathlon M Annecy'"),
  date: z.string().describe("Race date YYYY-MM-DD"),
  discipline: z.union([
    z.literal("run"),
    z.literal("triathlon"),
    z.literal("swim"),
    z.literal("bike"),
    z.literal("vtt"),
  ]),
  priority: z.union([z.literal("A"), z.literal("B"), z.literal("C")]),
  target_time: z.string().optional(),
  notes: z.string().optional(),
});

export const TrainingPhase = z.object({
  code: z.string().describe("e.g. 'P0', 'P1', 'P2'"),
  description: z.string().optional(),
  start_date: z.string().optional().describe("YYYY-MM-DD"),
  current_week: z.number().int().optional().describe("Week number within the phase"),
  target_weekly_volume_km: z.number().optional().describe("Target weekly run volume in km"),
});

export const AthleteGoals = z.object({
  events: z.array(Event),
  current_phase: TrainingPhase.optional(),
  season_notes: z.string().optional(),
});

export type AthleteGoals = z.infer<typeof AthleteGoals>;

// --- Policies ---

export const PolicyRule = z.object({
  id: z.string(),
  description: z.string(),
  condition: z.string().optional(),
  action: z.string().optional(),
  severity: z.union([z.literal("info"), z.literal("warn"), z.literal("block")]),
});

export const AthletePolicies = z.object({ rules: z.array(PolicyRule) });
export type AthletePolicies = z.infer<typeof AthletePolicies>;

// --- Notes ---

export const NOTE_TYPES = [
  "analyse_seance",
  "bilan_semaine",
  "decision_plan",
  "state_update",
  "general",
] as const;

export const NoteInput = z.object({
  note_text: z
    .string()
    .min(1)
    .describe("Full note content (required). Free-form text describing the session, week, or decision."),
  note_date: z.string().optional().describe("Date YYYY-MM-DD, defaults to today"),
  type: z.enum(NOTE_TYPES).optional().describe("Note category"),
  tags: z.array(z.string()).optional().describe("e.g. ['run', 'vélo', 'récupération']"),
  activity_id: z
    .string()
    .optional()
    .describe("Garmin activity ID as a string (optional)"),
});

export const NoteRow = z.object({
  id: z.number().optional(),
  activity_id: z.string().optional(),
  note_date: z.string().optional(),
  type: z.string().optional(),
  raw_text: z.string(),
  tags_json: z.string().optional(),
  extracted_json: z.string().optional(),
  created_at: z.string().optional(),
});

export type Note = z.infer<typeof NoteRow>;

export const Extracted = z.object({
  rpe: z.number().int().min(1).max(10).optional(),
  stress: z.number().int().min(0).max(10).optional(),
  sleep_quality: z.number().int().min(0).max(10).optional(),
  social_context: z
    .union([
      z.literal("solo"),
      z.literal("couple"),
      z.literal("amis"),
      z.literal("club"),
      z.literal("unknown"),
    ])
    .optional(),
  pain: z
    .array(
      z.object({
        area: z.string(),
        intensity: z.number().min(0).max(10),
        type: z.string().optional(),
      })
    )
    .optional(),
  raw_text: z.string(),
});

export type Extracted = z.infer<typeof Extracted>;

// --- Daily subjective state ---

export const SubjectiveStateInput = z.object({
  ankle_pain: z.number().min(0).max(10).optional().describe("Ankle pain 0–10"),
  fatigue: z.number().min(0).max(10).optional().describe("Subjective fatigue 0–10"),
  sleep_quality: z.number().min(0).max(10).optional().describe("Sleep quality 0–10"),
  comment: z.string().optional().describe("Free-form comment"),
});

export type SubjectiveStateInput = z.infer<typeof SubjectiveStateInput>;

// --- Computed state (derived from notes) ---

export const AthleteState = z.object({
  stress_trend_7d: z.number().optional(),
  rpe_trend_7d: z.number().optional(),
  pain_watchlist: z.array(
    z.object({
      area: z.string(),
      occurrences: z.number(),
      avg_intensity: z.number(),
    })
  ),
  solo_ratio_14d: z.number().optional(),
  readiness_subjective: z.number().min(0).max(100),
  flags: z.array(z.string()),
});

export type AthleteState = z.infer<typeof AthleteState>;

// --- Sleep log (one entry per night, upsert by date) ---

export const SleepLogEntry = z.object({
  date: z.string().describe("Night date YYYY-MM-DD (required)"),

  // Duration & quality
  duration_min: z.number().int().optional().describe("Effective sleep duration in minutes"),
  score: z.number().int().min(0).max(100).optional().describe("Garmin sleep score 0–100"),
  qualifier: z
    .enum(["poor", "fair", "good", "excellent"])
    .optional()
    .describe("Garmin sleep quality qualifier"),

  // HRV
  hrv_avg_ms: z
    .number()
    .optional()
    .describe("Average overnight HRV in ms (RMSSD)"),
  hrv_status: z
    .enum(["balanced", "unbalanced", "low"])
    .optional()
    .describe("HRV status vs personal baseline"),
  hrv_baseline_low: z
    .number()
    .optional()
    .describe("Lower bound of personal HRV baseline (ms)"),
  hrv_baseline_high: z
    .number()
    .optional()
    .describe("Upper bound of personal HRV baseline (ms)"),

  // Cardiovascular
  resting_hr_bpm: z.number().int().optional().describe("Resting heart rate in bpm"),

  // Sleep stages
  deep_pct: z.number().min(0).max(100).optional().describe("Deep sleep %"),
  rem_pct: z.number().min(0).max(100).optional().describe("REM sleep %"),
  light_pct: z.number().min(0).max(100).optional().describe("Light sleep %"),
  awake_min: z.number().int().optional().describe("Minutes awake during the night"),
});

export type SleepLogEntry = z.infer<typeof SleepLogEntry>;
