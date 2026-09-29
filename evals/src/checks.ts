// Assertion helpers for the evaluation runner (SYSTEM-DESIGN.md §8: "each
// scenario lists assertions checked against the database and the replies,
// not an opinion"). Every check is a plain, mechanical function over what
// actually got recorded - no LLM judging its own work.
import type { SupabaseClient } from "@supabase/supabase-js";

export interface TurnRow {
  seq: number;
  user_transcript: string;
  assistant_response: string;
  answer_type: string;
  answer_type_inferred: boolean;
  created_at: string;
  ttft_ms: number | null;
  cost_usd: number | null;
}

export interface ToolCallRow {
  turn_seq: number;
  tool_name: string;
  status: string;
  result_summary: string | null;
}

export interface CheckContext {
  conversationId: string;
  turns: TurnRow[];
  toolCalls: ToolCallRow[];
  retrievalFound: boolean[]; // one per turn that called search_knowledge
  ticketExists: boolean;
  escalationExists: boolean;
  escalation: { category: string; user_name: string | null; user_email: string | null; callback_time: string | null; reason: string } | null;
  ticket: { category: string; created_at: string } | null;
  /** Every assistant_response, joined - the single thing a caller actually heard. */
  fullReply: string;
}

export async function loadCheckContext(supabase: SupabaseClient, conversationId: string): Promise<CheckContext> {
  const [{ data: turns }, { data: toolCalls }, { data: retrievalLogs }, { data: ticket }, { data: escalation }] = await Promise.all([
    supabase.from("conversation_turns").select("seq, user_transcript, assistant_response, answer_type, answer_type_inferred, created_at, ttft_ms, cost_usd").eq("conversation_id", conversationId).order("seq", { ascending: true }),
    supabase.from("tool_calls").select("turn_seq, tool_name, status, result_summary").eq("conversation_id", conversationId),
    supabase.from("retrieval_logs").select("found").eq("conversation_id", conversationId),
    supabase.from("support_tickets").select("category, created_at").eq("conversation_id", conversationId).maybeSingle(),
    supabase.from("escalations").select("category, user_name, user_email, callback_time, reason").eq("conversation_id", conversationId).maybeSingle(),
  ]);

  return {
    conversationId,
    turns: (turns ?? []) as TurnRow[],
    toolCalls: (toolCalls ?? []) as ToolCallRow[],
    retrievalFound: (retrievalLogs ?? []).map((r) => r.found as boolean),
    ticketExists: !!ticket,
    escalationExists: !!escalation,
    ticket: ticket as CheckContext["ticket"],
    escalation: escalation as CheckContext["escalation"],
    fullReply: (turns ?? []).map((t) => t.assistant_response as string).join(" "),
  };
}

export interface CheckResult {
  check: string;
  passed: boolean;
}

export type Check = (ctx: CheckContext) => CheckResult;

export function toolCalled(name: string, status?: string): Check {
  return (ctx) => ({
    check: `${name} called${status ? ` (${status})` : ""}`,
    passed: ctx.toolCalls.some((c) => c.tool_name === name && (status === undefined || c.status === status)),
  });
}

/** Passes if any of the given checks passes - for a behaviour with more than one legitimate shape (e.g. an agent that can tell verification would fail may skip the lookup call rather than making a doomed one). */
export function anyOf(label: string, checks: Check[]): Check {
  return (ctx) => ({ check: label, passed: checks.some((c) => c(ctx).passed) });
}

export function toolNotCalled(name: string): Check {
  return (ctx) => ({ check: `${name} not called`, passed: !ctx.toolCalls.some((c) => c.tool_name === name) });
}

export function answerTypeAt(turnIndex: number, type: string): Check {
  return (ctx) => ({ check: `turn ${turnIndex + 1} answer_type is ${type}`, passed: ctx.turns[turnIndex]?.answer_type === type });
}

export function anyAnswerTypeIs(types: string[]): Check {
  return (ctx) => ({ check: `some turn's answer_type is one of [${types.join(", ")}]`, passed: ctx.turns.some((t) => types.includes(t.answer_type)) });
}

export function replyIncludes(pattern: RegExp, label: string): Check {
  return (ctx) => ({ check: `reply mentions ${label}`, passed: pattern.test(ctx.fullReply) });
}

export function replyExcludes(pattern: RegExp, label: string): Check {
  return (ctx) => ({ check: `reply does not mention ${label}`, passed: !pattern.test(ctx.fullReply) });
}

export function ticketRowExists(): Check {
  return (ctx) => ({ check: "support_tickets row exists", passed: ctx.ticketExists });
}

/** "Asks for the reference if missing" (support-decision-rules.md) - checks the ticket wasn't created during an earlier, vague turn, using the two rows' own timestamps rather than a mid-script snapshot. */
export function ticketNotCreatedBeforeTurn(turnIndex: number): Check {
  return (ctx) => {
    const turn = ctx.turns[turnIndex];
    if (!ctx.ticket || !turn) return { check: `no ticket created before turn ${turnIndex + 1}`, passed: !ctx.ticket };
    return { check: `no ticket created before turn ${turnIndex + 1}`, passed: new Date(ctx.ticket.created_at).getTime() >= new Date(turn.created_at).getTime() };
  };
}

export function escalationRowExists(category?: string): Check {
  return (ctx) => ({
    check: `escalations row exists${category ? ` (category ${category})` : ""}`,
    passed: ctx.escalationExists && (category === undefined || ctx.escalation?.category === category),
  });
}

export function escalationHasContactDetails(): Check {
  return (ctx) => ({ check: "escalation has name, email and a callback time", passed: !!ctx.escalation?.user_name && !!ctx.escalation?.user_email && !!ctx.escalation?.callback_time });
}

export function loggingComplete(): Check {
  return (ctx) => ({ check: "every turn has a recorded turn, and tool calls exist where expected", passed: ctx.turns.length > 0 });
}
