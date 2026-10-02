// @vitest-environment node
//
// "Recorded-session replay through the real MCP tools ($0)" (Task 6): a
// scripted sequence of tool calls, taken from test-scenarios.md, run
// through the real @core/mcp tool functions and real Supabase - no Claude
// call, no MCP HTTP hop, $0 - then read back through the exact same
// readTurnToolCalls + decideTurn pipeline agent-server's Session uses at
// the end of a real turn. This is the seam Task 5's per-tool tests and
// Task 6's decision unit tests don't individually cover: that what
// mcp-server logs is actually enough, via turn_seq alone, for the agent
// to reconstruct the right answer_type afterwards.
import { afterEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decideTurn } from "@core/agent";
import { callMutationWithLogging, callWithLogging, currentTurnSeq, readTurnToolCalls, type ToolContext } from "@core/mcp";
import { createEscalation } from "@core/mcp/tools/create-escalation";
import { lookupCustomer } from "@core/mcp/tools/lookup-customer";
import { lookupPayout } from "@core/mcp/tools/lookup-payout";
import { serviceRoleClient } from "../helpers/db";

// The same wrapping mcp-server/src/server.ts puts around every tool - a
// tool call only reaches tool_calls (and so only reaches Session's
// readTurnToolCalls) through callWithLogging, never by calling a tool
// function directly. Caught live: calling lookupCustomer/lookupPayout
// directly in this file's first draft left tool_calls empty and every
// scenario below inferred "clarify" regardless of what the lookup found.
async function loggedLookupCustomer(context: ToolContext, input: Parameters<typeof lookupCustomer>[1]) {
  return callWithLogging(context, "lookup_customer", "verify the caller and look up their account", input, async () => {
    const result = await lookupCustomer(context, input);
    return { status: result.found ? ("ok" as const) : ("not_found" as const), result };
  });
}

async function loggedLookupPayout(context: ToolContext, input: Parameters<typeof lookupPayout>[1]) {
  return callWithLogging(context, "lookup_payout", "look up a payout the caller referenced", input, async () => {
    const result = await lookupPayout(context, input);
    return { status: result.found ? ("ok" as const) : ("not_found" as const), result };
  });
}

async function loggedCreateEscalation(context: ToolContext, input: Parameters<typeof createEscalation>[1]) {
  return callWithLogging(context, "create_escalation", "hand the caller off to human support", input, async () => {
    const result = await createEscalation(context, input);
    return { status: "refused" in result || "confirmation_required" in result ? ("refused" as const) : ("ok" as const), result };
  });
}

const supabase: SupabaseClient = serviceRoleClient();
const conversationIds: string[] = [];

/** `customerId`: who's signed in - the conversation is bound to them, as agent-server does from the account. */
async function newConversation(customerId: string | null = null): Promise<string> {
  const { data, error } = await supabase.from("conversations").insert({ channel: "web_text", verified_customer_id: customerId }).select("id").single();
  if (error) throw error;
  conversationIds.push(data.id as string);
  return data.id as string;
}

/** Inserts the conversation_turns row a real turn ends with, the way Session does, so the next turn's currentTurnSeq advances. */
async function recordTurn(context: ToolContext, seq: number, transcript: string, reply: string): Promise<void> {
  const { error } = await supabase.from("conversation_turns").insert({ conversation_id: context.conversationId, seq, user_transcript: transcript, assistant_response: reply, answer_type: "answer" });
  if (error) throw error;
}

afterEach(async () => {
  for (const id of conversationIds.splice(0)) await supabase.from("conversations").delete().eq("id", id);
});

describe("recorded-session replay through the real MCP tools", () => {
  it("preserves useful structured database errors without inviting a retry", async () => {
    const conversationId = await newConversation();
    const context: ToolContext = { supabase, conversationId };
    const result = await callWithLogging(context, "create_escalation", "test failure", {}, async () => {
      throw { code: "23514", message: "violates callback business-hours constraint", details: "Saturday is unavailable" };
    });

    expect(result).toEqual({ error: "internal_error", retryable: false });
    const { data } = await supabase.from("tool_calls").select("error_message").eq("conversation_id", conversationId).single();
    expect(data?.error_message).toContain("23514");
    expect(data?.error_message).toContain("callback business-hours constraint");
  });

  it("allows only one support mutation attempt in a turn", async () => {
    const conversationId = await newConversation();
    const context: ToolContext = { supabase, conversationId };
    let runs = 0;
    const invoke = () => callMutationWithLogging(context, "create_escalation", "book callback", {}, async () => {
      runs++;
      return { status: "refused" as const, result: { refused: true, reason: "weekend" } };
    });

    expect(await invoke()).toEqual({ refused: true, reason: "weekend" });
    expect(await invoke()).toEqual({ refused: true, reason: "already_attempted_this_turn", retryable: false });
    expect(runs).toBe(1);
  });

  it("Scenario 3 (customer lookup): a verified lookup replays to answer_type 'answer'", async () => {
    const conversationId = await newConversation("CUS-1001");
    const context: ToolContext = { supabase, conversationId };

    const seq = await currentTurnSeq(context);
    const result = await loggedLookupCustomer(context, { company_name: "LagosLedger", contact_name: "Amara Okafor" });
    expect(result.found).toBe(true);

    const toolCalls = await readTurnToolCalls(context, seq);
    const decision = decideTurn({ toolCalls });
    expect(decision).toMatchObject({ answer_type: "answer", inferred: true });
  });

  it(
    "Scenario 5 (payout needing review): a review-required payout replays to escalate, once the agent actually escalates",
    async () => {
      const conversationId = await newConversation("CUS-1003");
      const context: ToolContext = { supabase, conversationId };

      // Turn 1: the lookup itself - PAY-7002 is CUS-1003's, under compliance review.
      const lookupSeq = await currentTurnSeq(context);
      const payout = await loggedLookupPayout(context, { payout_id: "PAY-7002" });
      expect(payout).toMatchObject({ found: true, guidance: "escalate" });
      const lookupToolCalls = await readTurnToolCalls(context, lookupSeq);
      expect(decideTurn({ toolCalls: lookupToolCalls }).answer_type).toBe("answer"); // the lookup itself succeeded (found: true) - the turn escalates only once create_escalation is actually called, next turn
      await recordTurn(context, lookupSeq, "What is happening with payout PAY-7002?", "That payout needs compliance review - let me connect you with a specialist.");

      // Turn 2 proposes the escalation; turn 3 performs it after explicit confirmation.
      const proposalSeq = await currentTurnSeq(context);
      expect(proposalSeq).toBe(lookupSeq + 1);
      const details = { user_name: "Efua Mensah", user_email: "efua@accrastack.example", category: "compliance", reason: "Payout PAY-7002 needs compliance review." };
      const proposal = await loggedCreateEscalation(context, details) as { confirmation_key: string };
      expect(proposal.confirmation_key).toEqual(expect.any(String));
      await recordTurn(context, proposalSeq, "Please escalate it.", "I can create that escalation. Would you like me to proceed?");

      const escalateSeq = await currentTurnSeq(context);
      const escalation = await loggedCreateEscalation(context, { ...details, confirmed: true, confirmation_key: proposal.confirmation_key });
      expect("escalation_id" in escalation).toBe(true);
      const escalateToolCalls = await readTurnToolCalls(context, escalateSeq);
      expect(decideTurn({ toolCalls: escalateToolCalls }).answer_type).toBe("escalate");
    },
    15_000,
  );

  it("Scenario 8 (unsupported question): no tool signal at all replays to the clarify fallback", async () => {
    const conversationId = await newConversation();
    const context: ToolContext = { supabase, conversationId };
    const seq = await currentTurnSeq(context);
    // No tool called this turn - a pure decline-by-knowledge-content turn the model answered from what it already knows about approved policy, with no lookup.
    const toolCalls = await readTurnToolCalls(context, seq);
    expect(decideTurn({ toolCalls }).answer_type).toBe("clarify");
  });
});
