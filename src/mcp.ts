import http from "http";
import { z } from "zod";
import * as tools from "./tools";
import { NoteInput, AthleteProfile, AthleteGoals, AthletePolicies } from "./models";

const PORT = Number(process.env.PORT || 3100);

const toolMap: Record<string, { handler: Function, schema?: z.ZodTypeAny }> = {
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

export function startServer() {
  const server = http.createServer(async (req,res)=>{
    res.setHeader('Content-Type','application/json');
    try {
      if (req.method === 'GET' && req.url === '/tools') {
        res.end(JSON.stringify({ tools: Object.keys(toolMap) }));
        return;
      }
      if (req.method === 'POST' && req.url && req.url.startsWith('/tool/')) {
        const name = req.url.replace('/tool/','');
        const tool = toolMap[name];
        if (!tool) { res.statusCode = 404; res.end(JSON.stringify({ error: 'tool not found' })); return; }
        let body = '';
        for await (const chunk of req) body += chunk;
        const json = body ? JSON.parse(body) : {};
        if (tool.schema) {
          const parsed = tool.schema.parse(json);
          const out = await tool.handler(parsed);
          res.end(JSON.stringify(out));
          return;
        } else {
          const out = await tool.handler(json);
          res.end(JSON.stringify(out));
          return;
        }
      }
      res.statusCode = 404; res.end(JSON.stringify({ error: 'not found' }));
    } catch (err:any) {
      console.error('mcp error', err);
      res.statusCode = 500; res.end(JSON.stringify({ error: String(err?.message || err) }));
    }
  });

  server.listen(PORT, ()=> console.log(`athlete-context-mcp listening on ${PORT}`));
}
