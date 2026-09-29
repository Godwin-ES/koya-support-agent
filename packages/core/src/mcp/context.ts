// Everything an MCP tool handler needs, scoped to one conversation.
// SYSTEM-DESIGN.md §5: "conversation context comes from the connection, not
// the model" - the server builds this once per connection (or, in stateless
// HTTP mode, once per request) from the X-Conversation-Id header, never
// from a model-supplied conversation_id.
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ToolContext {
  supabase: SupabaseClient;
  conversationId: string;
}

/**
 * turn_seq for tool_calls/retrieval_logs/conversation_events. Design
 * decision (SYSTEM-DESIGN.md §5 doesn't specify a transport for it, and the
 * MCP connection only carries X-Conversation-Id, not a per-turn header):
 * derived as (count of conversation_turns already recorded for this
 * conversation) + 1, i.e. "the turn in progress" - conversation_turns gets
 * its row once the turn's reply is ready (Task 6), so tool calls that
 * happen mid-turn are always counted as the next one.
 */
export async function currentTurnSeq(context: ToolContext): Promise<number> {
  const { count, error } = await context.supabase
    .from("conversation_turns")
    .select("*", { count: "exact", head: true })
    .eq("conversation_id", context.conversationId);
  if (error) throw error;
  return (count ?? 0) + 1;
}

/** Refuses a conversation_id input that doesn't match the connection's own scope (SYSTEM-DESIGN.md §5). */
export function matchesConversation(context: ToolContext, conversationIdInput: string | undefined): boolean {
  return conversationIdInput === undefined || conversationIdInput === context.conversationId;
}
