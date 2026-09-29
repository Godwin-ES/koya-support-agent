// log_conversation_event (SYSTEM-DESIGN.md §5, mcp-tool-requirements.md) -
// the agent's own declared decisions and other notable actions.
// event_type is free text (migration 002's comment: not a fixed list, the
// tool logs whatever it's given).
import type { ToolContext } from "../context";
import { currentTurnSeq } from "../context";

export interface LogConversationEventInput {
  event_type: string;
  summary: string;
  metadata?: Record<string, unknown>;
}

export type LogConversationEventResult = { logged: true };

export async function logConversationEvent(context: ToolContext, input: LogConversationEventInput): Promise<LogConversationEventResult> {
  const turnSeq = await currentTurnSeq(context);
  const { error } = await context.supabase.from("conversation_events").insert({
    conversation_id: context.conversationId,
    turn_seq: turnSeq,
    event_type: input.event_type,
    summary: input.summary,
    metadata: input.metadata ?? {},
  });
  if (error) throw error;
  return { logged: true };
}
