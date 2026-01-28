#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { 
  get_profile, upsert_profile, get_goals, upsert_goals, 
  get_policies, upsert_policies, add_note, get_note, 
  search_notes, get_state, update_state 
} from "./tools.js";
import { zodToJsonSchema } from "./schema-utils.js";
import { AthleteProfile, AthleteGoals, AthletePolicies, NoteInput } from "./models.js";

// Define request schemas for SDK
const InitializeSchema = z.object({
  method: z.literal("initialize"),
  params: z.object({
    protocolVersion: z.string(),
    capabilities: z.record(z.unknown()).optional(),
    clientInfo: z.object({
      name: z.string(),
      version: z.string(),
    }).optional(),
  }).optional(),
});

const ToolsListSchema = z.object({
  method: z.literal("tools/list"),
  params: z.record(z.unknown()).optional(),
});

const ToolsCallSchema = z.object({
  method: z.literal("tools/call"),
  params: z.object({
    name: z.string(),
    arguments: z.record(z.unknown()).optional(),
  }),
});

// Tool definitions
const toolDefinitions = [
  {
    name: "get_athlete_profile",
    description: "Get the current athlete profile",
    inputSchema: { type: "object" },
  },
  {
    name: "upsert_athlete_profile",
    description: "Create or update the athlete profile",
    inputSchema: zodToJsonSchema(AthleteProfile),
  },
  {
    name: "get_athlete_goals",
    description: "Get the current athlete training and recovery goals",
    inputSchema: { type: "object" },
  },
  {
    name: "upsert_athlete_goals",
    description: "Create or update athlete training and recovery goals",
    inputSchema: zodToJsonSchema(AthleteGoals),
  },
  {
    name: "get_athlete_policies",
    description: "Get the current athlete policies and preferences",
    inputSchema: { type: "object" },
  },
  {
    name: "upsert_athlete_policies",
    description: "Create or update athlete policies and preferences",
    inputSchema: zodToJsonSchema(AthletePolicies),
  },
  {
    name: "add_note",
    description: "Add a new athlete note with activity data",
    inputSchema: zodToJsonSchema(NoteInput),
  },
  {
    name: "get_note",
    description: "Retrieve a specific note by ID",
    inputSchema: {
      type: "object",
      properties: { note_id: { type: "string" } },
      required: ["note_id"],
    },
  },
  {
    name: "search_notes",
    description: "Search notes with filters",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        since: { type: "string" },
        until: { type: "string" },
        limit: { type: "number" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_athlete_state",
    description: "Get current computed athlete state and metrics",
    inputSchema: { type: "object" },
  },
  {
    name: "update_athlete_state",
    description: "Update athlete subjective state",
    inputSchema: {
      type: "object",
      properties: {
        readiness_subjective: { type: "number", minimum: 0, maximum: 100 }
      }
    },
  },
];

async function main() {
  const server = new Server({
    name: "athlete-context-mcp",
    version: "0.1.0",
  });

  // Declare capabilities BEFORE registering handlers
  (server as any).serverCapabilities = {
    tools: {},
  };

  // Initialize handler - MUST come first to declare capabilities
  server.setRequestHandler(
    InitializeSchema,
    async () => ({
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {},
      },
      serverInfo: {
        name: "athlete-context-mcp",
        version: "0.1.0",
      },
    })
  );

  // List tools
  server.setRequestHandler(
    ToolsListSchema,
    async () => ({
      tools: toolDefinitions,
    })
  );

  // Call tool
  server.setRequestHandler(
    ToolsCallSchema,
    async (request: z.infer<typeof ToolsCallSchema>) => {
      const { name, arguments: toolArgs } = request.params;
      const args = (toolArgs || {}) as any;

      switch (name) {
        case "get_athlete_profile":
          return get_profile();
        case "upsert_athlete_profile":
          return upsert_profile(args);
        case "get_athlete_goals":
          return get_goals();
        case "upsert_athlete_goals":
          return upsert_goals(args);
        case "get_athlete_policies":
          return get_policies();
        case "upsert_athlete_policies":
          return upsert_policies(args);
        case "add_note":
          return add_note(args);
        case "get_note":
          return get_note(args.activity_id);
        case "search_notes":
          return search_notes(args.query || "", args.since, args.until, args.limit);
        case "get_athlete_state":
          return get_state();
        case "update_athlete_state":
          return update_state(args);
        default:
          return { error: `Unknown tool: ${name}` };
      }
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Athlete Context MCP server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
