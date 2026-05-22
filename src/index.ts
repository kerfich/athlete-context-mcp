#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  get_profile,
  upsert_profile,
  get_goals,
  upsert_goals,
  get_policies,
  upsert_policies,
  add_note,
  get_note,
  search_notes,
  get_state,
  update_state,
  upsert_sleep_log,
  get_sleep_trends,
  get_context,
} from "./tools.js";
import {
  AthleteProfile,
  AthleteGoals,
  AthletePolicies,
  NoteInput,
  SubjectiveStateInput,
  SleepLogEntry,
  NOTE_TYPES,
} from "./models.js";

async function main() {
  const server = new McpServer({
    name: "athlete-context-mcp",
    version: "0.3.0",
  });

  const ok = (data: any) => ({
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  });

  // --- Profile ---

  server.tool(
    "get_athlete_profile",
    "Get the current athlete profile (weight, HR/pace zones, FTP, biomechanics targets, injury history)",
    {},
    async () => ok(get_profile())
  );

  server.tool(
    "upsert_athlete_profile",
    "Create or update the athlete profile. All fields are optional — only send what changed.",
    AthleteProfile.shape,
    async (args) => ok(upsert_profile(args))
  );

  // --- Goals ---

  server.tool(
    "get_athlete_goals",
    "Get the athlete's season goals, race calendar, and current training phase",
    {},
    async () => ok(get_goals())
  );

  server.tool(
    "upsert_athlete_goals",
    "Create or update athlete season goals, events, and training phase",
    AthleteGoals.shape,
    async (args) => ok(upsert_goals(args))
  );

  // --- Policies ---

  server.tool(
    "get_athlete_policies",
    "Get athlete training policies and safety rules (volume limits, HR constraints, etc.)",
    {},
    async () => ok(get_policies())
  );

  server.tool(
    "upsert_athlete_policies",
    "Create or update athlete training policies and safety rules",
    AthletePolicies.shape,
    async (args) => ok(upsert_policies(args))
  );

  // --- State ---

  server.tool(
    "get_athlete_state",
    "Get the current athlete state: computed metrics (stress, RPE trends, pain watchlist) and last subjective assessment",
    {},
    async () => ok(get_state())
  );

  server.tool(
    "update_athlete_state",
    "Record the athlete's subjective daily state (ankle pain, fatigue, sleep quality, comment). Also recomputes derived metrics from recent notes.",
    SubjectiveStateInput.shape,
    async (args) => ok(update_state(args))
  );

  // --- Notes ---

  server.tool(
    "add_note",
    "Add a note: training session analysis, weekly review, or planning decision. Returns note_id for future retrieval.",
    NoteInput.shape,
    async (args) => ok(add_note(args))
  );

  server.tool(
    "get_note",
    "Retrieve a specific note by its numeric ID (returned by add_note)",
    { note_id: z.number().int().describe("Note ID returned by add_note") },
    async (args) => ok(get_note(args.note_id))
  );

  server.tool(
    "search_notes",
    "Search notes with optional filters. Without filters, returns the 10 most recent notes.",
    {
      query: z.string().optional().describe("Text search in note content"),
      date_from: z.string().optional().describe("Start date YYYY-MM-DD"),
      date_to: z.string().optional().describe("End date YYYY-MM-DD"),
      type: z.enum(NOTE_TYPES).optional().describe("Filter by note type"),
      tags: z.array(z.string()).optional().describe("Filter by tags (any match)"),
      limit: z.number().int().optional().describe("Max results (default 10)"),
    },
    async (args) => ok(search_notes(args))
  );

  // --- Sleep log ---

  server.tool(
    "upsert_sleep_log",
    "Insert or update a sleep log entry for a given night. Re-submitting the same date overwrites the entry (useful after a Garmin sync). Only 'date' is required — send only fields available.",
    SleepLogEntry.shape,
    async (args) => ok(upsert_sleep_log(args))
  );

  server.tool(
    "get_sleep_trends",
    "Return raw sleep entries + computed trends for the last N nights (default 14). Trends include: HRV direction, consecutive unbalanced streak, 7-day sleep debt vs 7h/night target, qualifier distribution.",
    {
      days: z
        .number()
        .int()
        .min(1)
        .max(30)
        .optional()
        .describe("Look-back window in nights (default 14, max 30)"),
    },
    async (args) => ok(get_sleep_trends(args.days ?? 14))
  );

  // --- Bootstrap ---

  server.tool(
    "get_context",
    "Bootstrap tool: returns profile + goals + policies + current state + last 3 notes in one call. Call this at the start of every conversation.",
    {},
    async () => ok(get_context())
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("athlete-context-mcp server v0.3.0 connected on stdio\n");
}

main().catch((error) => {
  process.stderr.write(`Fatal error: ${error.message}\n`);
  process.exit(1);
});
