#!/usr/bin/env node
import "./db";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as tools from "./tools";

// Helper: retourner du JSON dans un tool MCP (format "text" ultra-compatible)
const asText = (obj: unknown) => ({
  content: [{ type: "text", text: JSON.stringify(obj, null, 2) }],
});

async function main() {
  const server = new McpServer(
    { name: "athlete-context-mcp", version: "0.1.0" },
    // options facultatives
  );

  server.tool("get_profile", "Return the athlete profile", async () => asText(tools.get_profile()));

  server.tool(
    "upsert_profile",
    "Upsert the athlete profile",
    { profile: z.any() },
    async ({ profile }) => asText(tools.upsert_profile(profile))
  );

  server.tool("get_goals", "Return goals", async () => asText(tools.get_goals()));

  server.tool(
    "upsert_goals",
    "Upsert goals",
    { goals: z.any() },
    async ({ goals }) => asText(tools.upsert_goals(goals))
  );

  server.tool("get_policies", "Return policies", async () => asText(tools.get_policies()));

  server.tool(
    "upsert_policies",
    "Upsert policies",
    { policies: z.any() },
    async ({ policies }) => asText(tools.upsert_policies(policies))
  );

  server.tool(
    "add_note",
    "Attach a subjective note to an activity and extract signals",
    {
      activity_id: z.union([z.string(), z.number()]),
      note_text: z.string(),
      note_date: z.string().optional(),
      tags: z.array(z.string()).optional(),
    },
    async (input) => asText(await tools.add_note(input))
  );

  server.tool(
    "get_note",
    "Get note for activity_id",
    { activity_id: z.union([z.string(), z.number()]) },
    async ({ activity_id }) => asText(await tools.get_note(String(activity_id)))
  );

  server.tool(
    "search_notes",
    "Search notes",
    {
      query: z.string(),
      since: z.string().optional(),
      until: z.string().optional(),
      limit: z.number().int().positive().max(500).optional(),
    },
    async (q) => asText(await tools.search_notes(q.query, q.since, q.until, q.limit ?? 50))
  );

  server.tool("get_state", "Get computed athlete state", async () => asText(tools.get_state()));

  server.tool(
    "update_state",
    "Recompute athlete state",
    { since: z.string().optional() },
    async (opts) => asText(tools.update_state(opts))
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(String(err?.stack ?? err) + "\n");
  process.exit(1);
});
