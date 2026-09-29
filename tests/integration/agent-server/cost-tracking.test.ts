// @vitest-environment node
//
// Real bug fixed alongside Task 12: SDKResultSuccess.total_cost_usd is
// cumulative for the whole query() session, not per turn - Session used to
// write that running total as if it were the turn's own cost. Migration
// 014 added conversation_turns.cost_usd and a trigger that rolls it into
// conversations.cost_usd, so this checks Session computes the per-turn
// delta correctly across a multi-turn session, with a stubbed SDK ($0).
import { afterEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Query, SDKMessage, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { serviceRoleClient } from "../helpers/db";
import { Session } from "../../../agent-server/src/session";

const supabase: SupabaseClient = serviceRoleClient();
const conversationIds: string[] = [];

afterEach(async () => {
  for (const id of conversationIds.splice(0)) await supabase.from("conversations").delete().eq("id", id);
});

function textDelta(text: string): SDKMessage {
  return { type: "stream_event", event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } } } as unknown as SDKMessage;
}
function resultMessage(totalCostUsd: number): SDKMessage {
  return { type: "result", subtype: "success", duration_ms: 5, is_error: false, total_cost_usd: totalCostUsd, num_turns: 1 } as unknown as SDKMessage;
}

function scriptedQueryFactory(script: SDKMessage[]) {
  return (_args: { prompt: AsyncIterable<SDKUserMessage> }) => {
    let index = 0;
    return {
      next: async () => (index >= script.length ? { done: true as const, value: undefined } : { done: false as const, value: script[index++] }),
      interrupt: async () => {},
    } as unknown as Query;
  };
}

describe("per-turn cost_usd is a delta, not the SDK's cumulative total", () => {
  it(
    "three turns with cumulative totals 0.01, 0.03, 0.03 record deltas 0.01, 0.02, 0.00",
    async () => {
      const { data, error } = await supabase.from("conversations").insert({ channel: "web_text" }).select("id").single();
      if (error) throw error;
      const conversationId = data.id as string;
      conversationIds.push(conversationId);

      const session = new Session({
        conversationId,
        model: "claude-haiku-4-5",
        mcpServerUrl: "http://127.0.0.1:8090/mcp",
        mcpServerToken: "unused",
        supabase,
        queryFactory: scriptedQueryFactory([textDelta("a"), resultMessage(0.01), textDelta("b"), resultMessage(0.03), textDelta("c"), resultMessage(0.03)]),
      });

      for (const text of ["turn 1", "turn 2", "turn 3"]) {
        for await (const _event of session.runTurn(text)) {
          void _event;
        }
      }

      const { data: turns } = await supabase.from("conversation_turns").select("seq, cost_usd").eq("conversation_id", conversationId).order("seq", { ascending: true });
      expect(turns?.map((t) => Number(t.cost_usd))).toEqual([0.01, 0.02, 0]);

      const { data: conversation } = await supabase.from("conversations").select("cost_usd").eq("id", conversationId).single();
      expect(Number(conversation?.cost_usd)).toBeCloseTo(0.03, 4);
    },
    15_000,
  );
});
