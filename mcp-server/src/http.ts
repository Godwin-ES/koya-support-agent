// Streamable HTTP entry point for the MCP server (SYSTEM-DESIGN.md §5, §12):
// never reachable beyond this host, a bearer token shared with agent-server,
// and the X-Conversation-Id header that scopes every tool call. Stateless -
// a fresh McpServer and transport per request - which is also what makes it
// safe for the connection's ToolContext to close over the request's own
// headers directly, no session store needed.
//
// Binds 0.0.0.0 rather than the original 127.0.0.1: in the Task 13 compose
// deploy, agent-server and mcp-server are separate containers, so "this
// host" is the compose network, not literal loopback. The "never reachable
// beyond this host" guarantee still holds - this port is never published to
// the VM's public interface or proxied by Caddy (docker-compose.yml), only
// agent-server can reach it, and the bearer token still gates every call.
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";

// `dotenv/config`'s default (a bare `.env` next to the process cwd) misses
// this project's real file - every other entry point loads .env.local from
// the workspace root explicitly (scripts/ingest-knowledge.ts,
// tests/integration/helpers/db.ts); same here, since mcp-server runs from
// its own package directory (`pnpm --filter mcp-server dev`).
loadEnv({ path: path.resolve(import.meta.dirname, "../../.env.local") });
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { serviceRoleClient } from "./db";
import { createServer } from "./server";
import { warmEmbeddings } from "@core/knowledge/embeddings";

const PORT = Number(process.env.MCP_PORT ?? 8090);
const TOKEN = process.env.MCP_SERVER_TOKEN;

function sendJsonRpcError(res: ServerResponse, status: number, message: string): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }));
}

function bearerToken(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length);
}

async function handleMcp(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!TOKEN) return sendJsonRpcError(res, 500, "MCP_SERVER_TOKEN is not configured.");
  if (bearerToken(req) !== TOKEN) return sendJsonRpcError(res, 401, "Missing or invalid bearer token.");

  const conversationId = req.headers["x-conversation-id"];
  if (typeof conversationId !== "string" || conversationId.length === 0) {
    return sendJsonRpcError(res, 400, "Missing X-Conversation-Id header.");
  }

  const server = createServer({ supabase: serviceRoleClient(), conversationId });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res);
  } catch (err) {
    console.error("mcp-server: error handling request:", err instanceof Error ? err.message : err);
    if (!res.headersSent) sendJsonRpcError(res, 500, "Internal server error.");
  } finally {
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
  }
}

const httpServer = createHttpServer((req, res) => {
  if (req.url !== "/mcp") {
    res.writeHead(404).end();
    return;
  }
  if (req.method === "POST") {
    void handleMcp(req, res);
    return;
  }
  sendJsonRpcError(res, 405, "Method not allowed. This server only accepts POST /mcp (stateless mode).");
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`mcp-server (http): listening on http://0.0.0.0:${PORT}/mcp`);
  // Load the embedding model now, not during the first caller's knowledge
  // search - a live call after a restart spent 5s in search_knowledge (and
  // Vapi logged a "hang") paying this load cost mid-turn.
  const startedAt = Date.now();
  warmEmbeddings()
    .then(() => console.log(`mcp-server: embedding model ready in ${Date.now() - startedAt}ms`))
    .catch((err) => console.error("mcp-server: embedding warm-up failed:", err instanceof Error ? err.message : err));
});
