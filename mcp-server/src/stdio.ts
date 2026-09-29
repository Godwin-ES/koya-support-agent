// stdio entry point - for a grader or the MCP Inspector, against the same
// Supabase seed data, no HTTP server or token needed. A stdio connection is
// one long-lived session with no per-request headers to carry
// X-Conversation-Id, so the conversation is fixed for the whole process:
// MCP_STDIO_CONVERSATION_ID if set (point it at any real conversations.id),
// otherwise a fresh conversation is created on startup and its id printed
// to stderr (stdout is the MCP protocol channel) so the operator can find
// its logged rows in the console afterwards.
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// Same reasoning as http.ts: load .env.local from the workspace root explicitly.
loadEnv({ path: path.resolve(import.meta.dirname, "../../.env.local") });
import { serviceRoleClient } from "./db";
import { createServer } from "./server";

async function resolveConversationId(supabase: ReturnType<typeof serviceRoleClient>): Promise<string> {
  const existing = process.env.MCP_STDIO_CONVERSATION_ID;
  if (existing) return existing;

  const { data, error } = await supabase.from("conversations").insert({ channel: "web_text" }).select("id").single();
  if (error) throw error;
  console.error(`mcp-server (stdio): created conversation ${data.id} for this session.`);
  return data.id;
}

async function main(): Promise<void> {
  const supabase = serviceRoleClient();
  const conversationId = await resolveConversationId(supabase);
  const server = createServer({ supabase, conversationId });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`mcp-server (stdio): connected, scoped to conversation ${conversationId}.`);
}

main().catch((err) => {
  console.error("mcp-server (stdio): fatal error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
