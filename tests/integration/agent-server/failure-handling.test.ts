// @vitest-environment node
//
// SYSTEM-DESIGN.md §10's Claude-down and MCP-down fallbacks, against the
// real Session code with a stubbed Agent SDK that fails on cue - $0, no
// Claude calls, but real Supabase writes (the ticket, the ended
// conversation, the recorded turn) so this checks the actual DB state a
// caller-facing failure leaves behind, not just the emitted events.
import { afterEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Query, SDKMessage, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { CLAUDE_DOWN_FALLBACK, MCP_DOWN_FALLBACK } from "@core/domain/failure";
import { Session } from "../../../agent-server/src/session";
import { serviceRoleClient } from "../helpers/db";

const supabase: SupabaseClient = serviceRoleClient();
const conversationIds: string[] = [];

async function newConversation(): Promise<string> {
  const { data, error } = await supabase.from("conversations").insert({ channel: "web_text" }).select("id").single();
  if (error) throw error;
  conversationIds.push(data.id as string);
  return data.id as string;
}

afterEach(async () => {
  for (const id of conversationIds.splice(0)) await supabase.from("conversations").delete().eq("id", id);
});

function throwingQueryFactory(errorMessage: string): NonNullable<import("../../../agent-server/src/session").SessionOptions["queryFactory"]> {
  return (_args: { prompt: AsyncIterable<SDKUserMessage> }) =>
    ({
      next: async () => {
        throw new Error(errorMessage);
      },
      interrupt: async () => {},
    }) as unknown as Query;
}

function resultErrorQueryFactory(): NonNullable<import("../../../agent-server/src/session").SessionOptions["queryFactory"]> {
  return (_args: { prompt: AsyncIterable<SDKUserMessage> }) => {
    let sent = false;
    return {
      next: async () => {
        if (sent) return { done: true as const, value: undefined };
        sent = true;
        return { done: false as const, value: { type: "result", subtype: "error_during_execution", is_error: true, errors: ["overloaded_error"] } as unknown as SDKMessage };
      },
      interrupt: async () => {},
    } as unknown as Query;
  };
}

describe("Claude-down fallback", () => {
  it(
    "speaks the fallback, creates a ticket, ends the conversation with an error status, and closes the session",
    async () => {
      const conversationId = await newConversation();
      const session = new Session({
        conversationId,
        model: "claude-haiku-4-5",
        mcpServerUrl: "http://127.0.0.1:8090/mcp",
        mcpServerToken: "unused",
        supabase,
        queryFactory: throwingQueryFactory("socket hang up"),
      });

      const events = [];
      for await (const event of session.runTurn("What are your fees?")) events.push(event);

      const deltas = events.filter((e) => e.kind === "delta").map((e) => (e as { text: string }).text);
      expect(deltas.join("")).toBe(CLAUDE_DOWN_FALLBACK);
      expect(events.at(-1)).toMatchObject({ kind: "done", answer_type: "decline" });

      const { data: conversation } = await supabase.from("conversations").select("ended_at, ended_reason, final_status").eq("id", conversationId).single();
      expect(conversation).toMatchObject({ ended_reason: "anthropic_failure", final_status: "error" });
      expect(conversation?.ended_at).toBeTruthy();

      const { data: ticket } = await supabase.from("support_tickets").select("category, priority").eq("conversation_id", conversationId).single();
      expect(ticket).toMatchObject({ category: "other", priority: "urgent" });

      const { data: turn } = await supabase.from("conversation_turns").select("assistant_response, answer_type").eq("conversation_id", conversationId).single();
      expect(turn).toMatchObject({ assistant_response: CLAUDE_DOWN_FALLBACK, answer_type: "decline" });
    },
    15_000,
  );

  it(
    "also triggers on an SDKResultError (the SDK didn't throw, but the turn still failed)",
    async () => {
      const conversationId = await newConversation();
      const session = new Session({ conversationId, model: "claude-haiku-4-5", mcpServerUrl: "http://127.0.0.1:8090/mcp", mcpServerToken: "unused", supabase, queryFactory: resultErrorQueryFactory() });

      const events = [];
      for await (const event of session.runTurn("What are your fees?")) events.push(event);
      const deltas = events.filter((e) => e.kind === "delta").map((e) => (e as { text: string }).text);
      expect(deltas.join("")).toBe(CLAUDE_DOWN_FALLBACK);
    },
    15_000,
  );
});

describe("MCP-down fallback", () => {
  it(
    "speaks the MCP-specific fallback when the failure message names the MCP server",
    async () => {
      const conversationId = await newConversation();
      const session = new Session({
        conversationId,
        model: "claude-haiku-4-5",
        mcpServerUrl: "http://127.0.0.1:8090/mcp",
        mcpServerToken: "unused",
        supabase,
        queryFactory: throwingQueryFactory("connect ECONNREFUSED 127.0.0.1:8090/mcp"),
      });

      const events = [];
      for await (const event of session.runTurn("What are your fees?")) events.push(event);
      const deltas = events.filter((e) => e.kind === "delta").map((e) => (e as { text: string }).text);
      expect(deltas.join("")).toBe(MCP_DOWN_FALLBACK);

      const { data: conversation } = await supabase.from("conversations").select("ended_reason").eq("id", conversationId).single();
      expect(conversation?.ended_reason).toBe("mcp_failure");
    },
    15_000,
  );
});
