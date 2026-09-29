// The real entry point - builds the real dependencies from the environment
// and starts listening. All route logic lives in app.ts's createApp(), so
// tests can build the same app around a stubbed SessionManager with no live
// listener (see tests/integration/agent-server/app.test.ts).
import { config } from "dotenv";
config({ path: "../.env.local", quiet: true });

import { createClient } from "@supabase/supabase-js";
import { createApp } from "./app";
import { SessionManager } from "./session-manager";

const PORT = Number(process.env.AGENT_SERVER_PORT ?? 8091);
const CONVERSATION_TOKEN_SECRET = process.env.CONVERSATION_TOKEN_SECRET;
const VISITOR_HASH_SALT = process.env.VISITOR_HASH_SALT;
const MCP_SERVER_URL = process.env.MCP_SERVER_URL;
const MCP_SERVER_TOKEN = process.env.MCP_SERVER_TOKEN;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";

for (const [name, value] of Object.entries({ CONVERSATION_TOKEN_SECRET, VISITOR_HASH_SALT, MCP_SERVER_URL, MCP_SERVER_TOKEN })) {
  if (!value) throw new Error(`${name} is not set (see .env.example).`);
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const sessionManager = new SessionManager({ supabase, mcpServerUrl: MCP_SERVER_URL!, mcpServerToken: MCP_SERVER_TOKEN!, model: MODEL, effort: "low" });
sessionManager.startIdleSweep();

// SYSTEM-DESIGN.md §10: "Supabase unavailable: writes retry with backoff.
// If still down, the turn continues, and the log is buffered in memory and
// written later." This is the "written later" - a periodic drain attempt,
// independent of any particular call.
setInterval(() => {
  void sessionManager.flushBufferedWrites();
}, 30_000).unref();

const app = createApp({
  supabase,
  sessionManager,
  conversationTokenSecret: CONVERSATION_TOKEN_SECRET!,
  visitorHashSalt: VISITOR_HASH_SALT!,
  vapiServerSecret: process.env.VAPI_SERVER_SECRET,
  model: MODEL,
});

app.listen(PORT, () => {
  console.log(`agent-server listening on :${PORT}`);
});
