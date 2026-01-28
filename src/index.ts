import './db.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as tools from './tools.js';
import { NoteInput, AthleteProfile, AthleteGoals, AthletePolicies } from './models.js';
import { zodToJsonSchema } from './schema-utils.js';

/**
 * MCP Server (JSON-RPC 2.0 over stdio) using official SDK.
 * Registers tools via Server API and lets SDK handle initialize/listTools/callTool.
 */

const server = new Server({
  name: 'athlete-context-mcp',
  version: '0.1.0'
});

// Helper to create tool response
function toolResult(data: any): { content: Array<{ type: string; [key: string]: any }> } {
  return {
    content: [{ type: 'json', json: data }]
  };
}

// Tool: get_profile
server.tool('get_profile', 'Get athlete profile (versioned)', {}, async () => {
  const result = tools.get_profile();
  return toolResult(result);
});

// Tool: upsert_profile
server.tool('upsert_profile', 'Upsert athlete profile', zodToJsonSchema(AthleteProfile), async (input: any) => {
  const parsed = AthleteProfile.parse(input);
  const result = tools.upsert_profile(parsed);
  return toolResult(result);
});

// Tool: get_goals
server.tool('get_goals', 'Get athlete goals (versioned)', {}, async () => {
  const result = tools.get_goals();
  return toolResult(result);
});

// Tool: upsert_goals
server.tool('upsert_goals', 'Upsert athlete goals', zodToJsonSchema(AthleteGoals), async (input: any) => {
  const parsed = AthleteGoals.parse(input);
  const result = tools.upsert_goals(parsed);
  return toolResult(result);
});

// Tool: get_policies
server.tool('get_policies', 'Get athlete policies (versioned)', {}, async () => {
  const result = tools.get_policies();
  return toolResult(result);
});

// Tool: upsert_policies
server.tool('upsert_policies', 'Upsert athlete policies', zodToJsonSchema(AthletePolicies), async (input: any) => {
  const parsed = AthletePolicies.parse(input);
  const result = tools.upsert_policies(parsed);
  return toolResult(result);
});

// Tool: add_note
server.tool('add_note', 'Add a note linked to a Garmin activity', zodToJsonSchema(NoteInput), async (input: any) => {
  const parsed = NoteInput.parse(input);
  const result = tools.add_note(parsed);
  return toolResult(result);
});

// Tool: get_note
server.tool('get_note', 'Get note by activity_id', { type: 'object', properties: { activity_id: { type: 'string' } }, required: ['activity_id'] }, async (input: any) => {
  const activity_id = z.string().parse(input.activity_id);
  const result = tools.get_note(activity_id);
  return toolResult(result);
});

// Tool: search_notes
server.tool('search_notes', 'Search notes by query and optional date range', {
  type: 'object',
  properties: {
    query: { type: 'string' },
    since: { type: 'string', description: 'YYYY-MM-DD' },
    until: { type: 'string', description: 'YYYY-MM-DD' },
    limit: { type: 'number' }
  },
  required: ['query']
}, async (input: any) => {
  const query = z.string().parse(input.query);
  const since = input.since ? z.string().parse(input.since) : undefined;
  const until = input.until ? z.string().parse(input.until) : undefined;
  const limit = input.limit ? z.number().parse(input.limit) : undefined;
  const result = tools.search_notes(query, since, until, limit);
  return toolResult(result);
});

// Tool: get_state
server.tool('get_state', 'Get current athlete state (synthetic summary)', {}, async () => {
  const result = tools.get_state();
  return toolResult(result);
});

// Tool: update_state
server.tool('update_state', 'Update/compute athlete state from notes', {}, async () => {
  const result = tools.update_state();
  return toolResult(result);
});

// Run server on stdio
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server runs indefinitely listening on stdin/stdout
}

main().catch((err) => {
  console.error('Server startup error:', err);
  process.exit(1);
});
