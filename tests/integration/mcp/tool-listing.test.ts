// @vitest-environment node
//
// The week-5 lesson (tests/unit/runners/agent-sdk-tools.test.ts over
// there): a tool schema the SDK can't convert to JSON Schema can make
// tools/list silently drop every tool, while the connection itself still
// reports healthy. Same check here, against this project's own MCP server
// and the real @modelcontextprotocol/sdk Client - not just a typecheck.
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer, TOOL_NAMES } from "../../../mcp-server/src/server";
import { serviceRoleClient } from "../helpers/db";

describe("the MCP server's tools/list", () => {
  it(
    "lists all current MCP tools through a real MCP client",
    async () => {
      const supabase = serviceRoleClient();
      const { data, error } = await supabase.from("conversations").insert({ channel: "web_text" }).select("id").single();
      if (error) throw error;

      try {
        const server = createServer({ supabase, conversationId: data.id as string });
        const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
        await server.connect(serverTransport);

        const client = new Client({ name: "test", version: "1.0.0" });
        await client.connect(clientTransport);

        const listed = await client.listTools();
        expect(listed.tools.map((t) => t.name).sort()).toEqual([...TOOL_NAMES].sort());
      } finally {
        await supabase.from("conversations").delete().eq("id", data.id);
      }
    },
    15_000,
  );
});
