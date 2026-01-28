#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { TextContent } from "@modelcontextprotocol/sdk/types.js";
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
} from "./tools.js";
import { zodToJsonSchema } from "./schema-utils.js";
import {
  AthleteProfile,
  AthleteGoals,
  AthletePolicies,
  NoteInput,
} from "./models.js";

async function main() {
  const server = new McpServer({
    name: "athlete-context-mcp",
    version: "0.2.0",
  });

  // Helper to wrap tool results
  const toolResult = (data: any): TextContent => ({
    type: "text",
    text: JSON.stringify(data, null, 2),
  });

  // Register tools using the SDK's high-level API
  (server as any).tool(
    "get_athlete_profile",
    "Get the current athlete profile",
    z.object({}),
    async () => ({
      content: [toolResult(get_profile())],
    })
  );

  (server as any).tool(
    "upsert_athlete_profile",
    "Create or update the athlete profile",
    AthleteProfile,
    async (args: any) => ({
      content: [toolResult(upsert_profile(args))],
    })
  );

  (server as any).tool(
    "get_athlete_goals",
    "Get the current athlete training and recovery goals",
    z.object({}),
    async () => ({
      content: [toolResult(get_goals())],
    })
  );

  (server as any).tool(
    "upsert_athlete_goals",
    "Create or update athlete training and recovery goals",
    AthleteGoals,
    async (args: any) => ({
      content: [toolResult(upsert_goals(args))],
    })
  );

  (server as any).tool(
    "get_athlete_policies",
    "Get the current athlete policies and preferences",
    z.object({}),
    async () => ({
      content: [toolResult(get_policies())],
    })
  );

  (server as any).tool(
    "upsert_athlete_policies",
    "Create or update athlete policies and preferences",
    AthletePolicies,
    async (args: any) => ({
      content: [toolResult(upsert_policies(args))],
    })
  );

  (server as any).tool(
    "add_note",
    "Add a new athlete note with activity data",
    NoteInput,
    async (args: any) => ({
      content: [toolResult(add_note(args))],
    })
  );

  (server as any).tool(
    "get_note",
    "Retrieve a specific note by ID",
    z.object({
      activity_id: z.string(),
    }),
    async (args: any) => ({
      content: [toolResult(get_note(args.activity_id))],
    })
  );

  (server as any).tool(
    "search_notes",
    "Search notes with filters",
    z.object({
      query: z.string(),
      since: z.string().optional(),
      until: z.string().optional(),
      limit: z.number().optional(),
    }),
    async (args: any) => ({
      content: [
        toolResult(
          search_notes(args.query, args.since, args.until, args.limit)
        ),
      ],
    })
  );

  (server as any).tool(
    "get_athlete_state",
    "Get current computed athlete state and metrics",
    z.object({}),
    async () => ({
      content: [toolResult(get_state())],
    })
  );

  (server as any).tool(
    "update_athlete_state",
    "Update athlete subjective state",
    z.object({
      since: z.string().optional(),
    }),
    async (args: any) => ({
      content: [toolResult(update_state(args))],
    })
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(
    "athlete-context-mcp server connected on stdio\n"
  );
}

main().catch((error) => {
  process.stderr.write(`Fatal error: ${error.message}\n`);
  process.exit(1);
});
