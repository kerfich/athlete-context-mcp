import readline from "readline";
import { z } from "zod";
import * as tools from "./tools";
import { NoteInput, AthleteProfile, AthleteGoals, AthletePolicies } from "./models";
import db from "./db";
// Import SDK to satisfy requirement (may be used later for richer integration)
import "@modelcontextprotocol/sdk";

type RequestMsg = { id: string; tool: string; input?: any };
type ResponseMsg = { id: string; ok: boolean; result?: any; error?: string };

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });

const toolMap: Record<string, { handler: Function; schema?: z.ZodTypeAny }> = {
  get_profile: { handler: tools.get_profile },
  upsert_profile: { handler: tools.upsert_profile, schema: AthleteProfile },
  get_goals: { handler: tools.get_goals },
  upsert_goals: { handler: tools.upsert_goals, schema: AthleteGoals },
  get_policies: { handler: tools.get_policies },
  upsert_policies: { handler: tools.upsert_policies, schema: AthletePolicies },
  add_note: { handler: tools.add_note, schema: NoteInput },
  get_note: { handler: tools.get_note, schema: z.object({ activity_id: z.string() }) },
  search_notes: { handler: tools.search_notes, schema: z.object({ query: z.string(), since: z.string().optional(), until: z.string().optional(), limit: z.number().optional() }) },
  get_state: { handler: tools.get_state },
  update_state: { handler: tools.update_state }
};

function send(msg: ResponseMsg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function sendReady() {
  const info = { ready: true, tools: Object.keys(toolMap), db_path: db ? true : false };
  process.stdout.write(JSON.stringify(info) + "\n");
}

rl.on("line", async (line: string) => {
  if (!line.trim()) return;
  let req: RequestMsg | null = null;
  try {
    req = JSON.parse(line);
  } catch (err:any) {
    // ignore non-json lines
    return;
  }
  const id = req.id || String(Date.now());
  const tool = toolMap[req.tool];
  if (!tool) {
    send({ id, ok: false, error: `unknown tool ${req.tool}` });
    return;
  }
  try {
    const input = req.input ?? {};
    let parsed = input;
    if (tool.schema) {
      parsed = tool.schema.parse(input);
    }
    const result = await tool.handler(parsed);
    send({ id, ok: true, result });
  } catch (err:any) {
    console.error('tool error', req.tool, err);
    send({ id, ok: false, error: String(err?.message ?? err) });
  }
});

// Announce readiness
sendReady();
