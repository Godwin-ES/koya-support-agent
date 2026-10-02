// Every MCP tool call is logged, success and failure alike
// (mcp-tool-requirements.md: "log failed calls with enough detail to
// debug"; SYSTEM-DESIGN.md §5: "every call is logged, failures included").
// One wrapper so no individual tool handler can forget to.
import type { ToolContext } from "./context";
import { currentTurnSeq } from "./context";

export type ToolCallStatus = "ok" | "not_found" | "refused" | "error";

const SUMMARY_MAX = 500;

function summarize(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > SUMMARY_MAX ? `${text.slice(0, SUMMARY_MAX)}…` : text;
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    const fields = ["code", "message", "details", "hint"].flatMap((key) => value[key] == null ? [] : [`${key}=${String(value[key])}`]);
    if (fields.length) return fields.join("; ");
    try {
      return JSON.stringify(error);
    } catch {
      return "Unknown object error";
    }
  }
  return String(error);
}

/** A handler's own verdict on its result, read by the logging wrapper - result shape stays whatever the tool's contract says. */
export interface ToolOutcome<T> {
  status: ToolCallStatus;
  result: T;
}

export async function callWithLogging<T>(
  context: ToolContext,
  toolName: string,
  purpose: string | undefined,
  input: unknown,
  run: (callContext: ToolContext) => Promise<ToolOutcome<T>>,
): Promise<T> {
  const startedAt = Date.now();
  const turnSeqPromise = currentTurnSeq(context);
  // The handler may do other async work before it needs the turn sequence.
  // Observe an early lookup failure immediately so Node does not report an
  // unhandled rejection while the call itself is still in progress.
  void turnSeqPromise.catch(() => undefined);
  const callContext: ToolContext = { ...context, turnSeqPromise };
  let outcome: ToolOutcome<T>;
  let errorMessage: string | null = null;
  try {
    outcome = await run(callContext);
  } catch (err) {
    errorMessage = describeError(err);
    // Never throw out of a tool handler (SYSTEM-DESIGN.md §5) - the caller
    // gets a structured "something went wrong" result, not a crashed call.
    outcome = { status: "error", result: { error: "internal_error", retryable: false } as T };
  }

  const turnSeq = await turnSeqPromise.catch(() => null);
  await context.supabase.from("tool_calls").insert({
    conversation_id: context.conversationId,
    turn_seq: turnSeq,
    tool_name: toolName,
    purpose: purpose ?? null,
    input_summary: summarize(input),
    result_summary: summarize(outcome.result),
    status: outcome.status,
    error_message: errorMessage,
    duration_ms: Date.now() - startedAt,
  });

  return outcome.result;
}

export type RepeatedMutationRefusal = { refused: true; reason: "already_attempted_this_turn"; retryable: false };

/** Support writes are never retried or replaced by a different write in one caller turn. */
export async function callMutationWithLogging<T>(
  context: ToolContext,
  toolName: "create_support_ticket" | "create_escalation",
  purpose: string | undefined,
  input: unknown,
  run: (callContext: ToolContext) => Promise<ToolOutcome<T>>,
): Promise<T | RepeatedMutationRefusal> {
  const turnSeq = await currentTurnSeq(context);
  const scopedContext = { ...context, turnSeqPromise: Promise.resolve(turnSeq) };
  const { count, error } = await context.supabase
    .from("tool_calls")
    .select("*", { count: "exact", head: true })
    .eq("conversation_id", context.conversationId)
    .eq("turn_seq", turnSeq)
    .in("tool_name", ["create_support_ticket", "create_escalation"]);
  if (error) throw error;
  if ((count ?? 0) > 0) {
    return callWithLogging(scopedContext, toolName, purpose, input, async () => ({
      status: "refused",
      result: { refused: true, reason: "already_attempted_this_turn", retryable: false },
    }));
  }
  return callWithLogging(scopedContext, toolName, purpose, input, run);
}

export interface LoggedToolCall {
  name: string;
  status: ToolCallStatus;
}

/** Reads back what was logged for one turn - agent-server's Session uses this to infer answer_type from what actually ran, and it's the same read a recorded-session replay test drives directly. */
export async function readTurnToolCalls(context: ToolContext, turnSeq: number): Promise<LoggedToolCall[]> {
  const { data, error } = await context.supabase.from("tool_calls").select("tool_name, status").eq("conversation_id", context.conversationId).eq("turn_seq", turnSeq);
  if (error) throw error;
  return (data ?? []).map((row) => ({ name: row.tool_name as string, status: row.status as ToolCallStatus }));
}
