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
  run: () => Promise<ToolOutcome<T>>,
): Promise<T> {
  const startedAt = Date.now();
  let outcome: ToolOutcome<T>;
  let errorMessage: string | null = null;
  try {
    outcome = await run();
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    // Never throw out of a tool handler (SYSTEM-DESIGN.md §5) - the caller
    // gets a structured "something went wrong" result, not a crashed call.
    outcome = { status: "error", result: { error: "internal error" } as T };
  }

  const turnSeq = await currentTurnSeq(context).catch(() => null);
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
