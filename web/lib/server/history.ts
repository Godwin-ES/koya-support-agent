import "server-only";
import { supabaseAdminClient } from "@/lib/supabase/admin";
import { caseReference } from "@core/domain/case-reference";

export interface HistoryOutcome {
  kind: "escalation" | "ticket";
  reference: string;
  category: string;
}

export interface HistoryItem {
  id: string;
  channel: "web_voice" | "web_text" | "phone";
  startedAt: string;
  durationSeconds: number | null;
  opener: string | null;
  turns: number;
  outcome: HistoryOutcome | null;
  inProgress: boolean;
}

function outcomeFrom(escalations: Array<{ id: string; category: string }>, tickets: Array<{ id: string; category: string }>): HistoryOutcome | null {
  if (escalations[0]) return { kind: "escalation", reference: caseReference("escalation", escalations[0].id), category: escalations[0].category };
  if (tickets[0]) return { kind: "ticket", reference: caseReference("ticket", tickets[0].id), category: tickets[0].category };
  return null;
}

/** The signed-in account's own conversations, newest first. `callerRef` is the account id - never taken from the request. */
export async function listHistory(callerRef: string, onlyConversationId?: string): Promise<HistoryItem[]> {
  const supabase = supabaseAdminClient();
  let query = supabase
    .from("conversations")
    .select("id, channel, started_at, ended_at, conversation_turns(seq, user_transcript), escalations(id, category), support_tickets(id, category)")
    .eq("caller_ref", callerRef);
  if (onlyConversationId) query = query.eq("id", onlyConversationId);
  const { data, error } = await query.order("started_at", { ascending: false }).limit(50);
  if (error) throw error;
  type Row = { id: string; channel: HistoryItem["channel"]; started_at: string; ended_at: string | null; conversation_turns: Array<{ seq: number; user_transcript: string }>; escalations: Array<{ id: string; category: string }>; support_tickets: Array<{ id: string; category: string }> };
  return ((data ?? []) as Row[]).map((row) => {
    const turns = [...row.conversation_turns].sort((a, b) => a.seq - b.seq);
    return {
      id: row.id,
      channel: row.channel,
      startedAt: row.started_at,
      durationSeconds: row.ended_at ? Math.max(0, Math.round((new Date(row.ended_at).getTime() - new Date(row.started_at).getTime()) / 1000)) : null,
      opener: turns[0]?.user_transcript ?? null,
      turns: turns.length,
      outcome: outcomeFrom(row.escalations, row.support_tickets),
      inProgress: !row.ended_at,
    };
  });
}

export interface HistoryDetail extends HistoryItem {
  messages: Array<{ role: "user" | "assistant"; text: string }>;
}

/** One conversation, only if it belongs to `callerRef` - null otherwise, whether it exists or not. */
export async function getHistoryDetail(callerRef: string, conversationId: string): Promise<HistoryDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(conversationId)) return null;
  const [item] = await listHistory(callerRef, conversationId);
  if (!item) return null;
  const { data, error } = await supabaseAdminClient().from("conversation_turns").select("user_transcript, assistant_response").eq("conversation_id", conversationId).order("seq");
  if (error) throw error;
  const messages = ((data ?? []) as Array<{ user_transcript: string; assistant_response: string }>).flatMap((t) => [
    { role: "user" as const, text: t.user_transcript },
    ...(t.assistant_response ? [{ role: "assistant" as const, text: t.assistant_response }] : []),
  ]);
  return { ...item, messages };
}

export interface OpenChat {
  id: string;
  messages: HistoryDetail["messages"];
}

/**
 * The account's chat that's still open - the one to put back on screen after
 * a refresh or from History's "Continue". With no id, the most recent one.
 * Its conversation token isn't issued here: agent-server hands one over
 * (POST /api/conversations/resume) when the next message is sent.
 */
export async function getOpenChat(callerRef: string, conversationId?: string): Promise<OpenChat | null> {
  if (conversationId && !/^[0-9a-f-]{36}$/i.test(conversationId)) conversationId = undefined;
  let query = supabaseAdminClient().from("conversations").select("id").eq("caller_ref", callerRef).eq("channel", "web_text").is("ended_at", null);
  if (conversationId) query = query.eq("id", conversationId);
  const { data, error } = await query.order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const detail = await getHistoryDetail(callerRef, data.id as string);
  return detail ? { id: detail.id, messages: detail.messages } : null;
}
