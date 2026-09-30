// Ending a conversation, from any of its end signals: Vapi's end-of-call
// report, the chat's "End conversation", or the inactivity sweep (a chat
// left open in a closed tab never sends an end signal at all). Every path
// goes through finalizeConversation, so each conversation gets exactly one
// end time, summary, total cost and activity notification.
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildConversationSummary, endedLabel, type AnswerType, type Channel, type ConversationSummarizer, type VoiceLatency } from "@core/agent";
import { conversationFinishedMessage, sendDiscordActivity } from "@core/notify/discord";

export const CHAT_INACTIVE_MS = 15 * 60_000;
export const VOICE_STUCK_MS = 30 * 60_000;

interface TurnRow {
  user_transcript: string;
  assistant_response: string;
  answer_type: AnswerType;
  answer_type_inferred: boolean;
  confidence_note: string | null;
  cost_usd: number | null;
}

export function isFailedTurn(turn: Pick<TurnRow, "answer_type_inferred" | "confidence_note">): boolean {
  return turn.answer_type_inferred && /failure \(/.test(turn.confidence_note ?? "");
}

export interface FinalizeOptions {
  endedReason: string;
  finalStatus: "completed" | "error" | "abandoned";
  /** Vapi's own analysis summary, when it sent one - used in place of the built one. */
  vapiSummary?: string | null;
  vapiCallId?: string | null;
  /** Vapi's latency breakdown from the end-of-call report. */
  voiceLatency?: VoiceLatency | null;
  /** Writes the natural summary (Haiku). Without it, or if it fails, the built summary is used. */
  summarize?: ConversationSummarizer;
  /** Return as soon as the conversation is marked ended; write the summary, cost and notification afterwards. */
  inBackground?: boolean;
}

/** Returns false when the conversation was already ended (every end signal can arrive more than once). */
export async function finalizeConversation(supabase: SupabaseClient, conversationId: string, options: FinalizeOptions, now: Date = new Date()): Promise<boolean> {
  // The `ended_at is null` filter makes this the single winner of any race
  // between end signals - only one caller gets the row back.
  const { data: ended, error } = await supabase
    .from("conversations")
    .update({ ended_at: now.toISOString(), ended_reason: options.endedReason, final_status: options.finalStatus, ...(options.vapiCallId ? { vapi_call_id: options.vapiCallId } : {}), ...(options.voiceLatency ? { voice_latency: options.voiceLatency } : {}) })
    .eq("id", conversationId)
    .is("ended_at", null)
    .select("id, channel, caller_ref, started_at, verified_customer_id");
  if (error) throw error;
  const conversation = ended?.[0] as EndedConversation | undefined;
  if (!conversation) return false;

  // Ended from here on - a message arriving now is refused. The rest (summary,
  // cost, notification) can follow in the background when asked to.
  const completion = completeRecord(supabase, conversation, options, now);
  if (options.inBackground) {
    void completion.catch((err) => console.error(`completing the record for ${conversationId} failed:`, err));
  } else {
    await completion;
  }
  return true;
}

interface EndedConversation {
  id: string;
  channel: Channel;
  caller_ref: string | null;
  started_at: string;
  verified_customer_id: string | null;
}

async function completeRecord(supabase: SupabaseClient, conversation: EndedConversation, options: FinalizeOptions, now: Date): Promise<void> {
  const conversationId = conversation.id;
  const [turnsRes, ticketRes, escalationRes, customerRes] = await Promise.all([
    supabase.from("conversation_turns").select("user_transcript, assistant_response, answer_type, answer_type_inferred, confidence_note, cost_usd").eq("conversation_id", conversationId).order("seq"),
    supabase.from("support_tickets").select("category, priority").eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("escalations").select("category, call_booked").eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    conversation.verified_customer_id ? supabase.from("customers").select("company_name, contact_name").eq("customer_id", conversation.verified_customer_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const turns = (turnsRes.data ?? []) as TurnRow[];
  const ticket = ticketRes.data as { category: string; priority: string } | null;
  const escalationRow = escalationRes.data as { category: string; call_booked: boolean } | null;
  const escalation = escalationRow ? { category: escalationRow.category, callbackBooked: escalationRow.call_booked } : null;
  const label = endedLabel(options.endedReason);

  const customer = customerRes.data as { company_name: string; contact_name: string } | null;
  const builtSummary = buildConversationSummary({ channel: conversation.channel, turns, ticket, escalation, customerCompany: customer?.company_name ?? null, endedLabel: label });
  // A real account's conversation gets the natural summary; evaluation runs
  // (no account) keep the built one, which costs nothing.
  let summary = options.vapiSummary?.trim() || builtSummary;
  if (options.summarize && conversation.caller_ref && turns.length > 0) {
    try {
      summary = await options.summarize({
        channel: conversation.channel,
        customer: customer ? { name: customer.contact_name, company: customer.company_name } : null,
        turns,
        escalation,
        ticket: escalation ? null : ticket,
        endedLabel: label,
      });
    } catch (err) {
      console.error("natural summary failed, keeping the built one:", err instanceof Error ? err.message : err);
    }
  }
  const costUsd = turns.reduce((sum, t) => sum + Number(t.cost_usd ?? 0), 0);
  await supabase.from("conversations").update({ summary, cost_usd: Number(costUsd.toFixed(4)) }).eq("id", conversationId);

  // Conversations with no account are evaluation runs - the runner posts
  // one message for the whole run instead of one per scenario.
  if (conversation.caller_ref) {
    const answerCounts: Partial<Record<AnswerType, number>> = {};
    for (const t of turns) answerCounts[t.answer_type] = (answerCounts[t.answer_type] ?? 0) + 1;
    await sendDiscordActivity(
      conversationFinishedMessage({
        conversationId,
        channel: conversation.channel,
        durationSeconds: Math.max(0, Math.round((now.getTime() - new Date(conversation.started_at).getTime()) / 1000)),
        turns: turns.length,
        answerCounts,
        endedLabel: label,
        failed: options.finalStatus === "error" || turns.some(isFailedTurn),
        ticket: escalation ? null : ticket,
        escalation,
        customerId: conversation.verified_customer_id,
        costUsd,
      }),
    );
  }
}

/**
 * Closes conversations that will never get an end signal: chats with no new
 * message for 15 minutes, and voice calls still open 30 minutes after they
 * started (the 5-minute cap means Vapi's end-of-call report never arrived).
 * Returns the ids closed.
 */
export async function sweepStaleConversations(supabase: SupabaseClient, now: Date = new Date(), summarize?: ConversationSummarizer): Promise<string[]> {
  const cutoff = new Date(now.getTime() - CHAT_INACTIVE_MS).toISOString();
  const { data, error } = await supabase.from("conversations").select("id, channel, started_at").is("ended_at", null).lt("started_at", cutoff).limit(100);
  if (error) throw error;

  const closed: string[] = [];
  for (const row of (data ?? []) as Array<{ id: string; channel: Channel; started_at: string }>) {
    if (row.channel === "web_text") {
      const { data: last } = await supabase.from("conversation_turns").select("created_at").eq("conversation_id", row.id).order("seq", { ascending: false }).limit(1).maybeSingle();
      const lastActivity = new Date((last as { created_at: string } | null)?.created_at ?? row.started_at).getTime();
      if (now.getTime() - lastActivity < CHAT_INACTIVE_MS) continue;
      if (await finalizeConversation(supabase, row.id, { endedReason: "inactive", finalStatus: "abandoned", summarize }, now)) closed.push(row.id);
    } else if (now.getTime() - new Date(row.started_at).getTime() >= VOICE_STUCK_MS) {
      if (await finalizeConversation(supabase, row.id, { endedReason: "no_end_of_call_report", finalStatus: "error", summarize }, now)) closed.push(row.id);
    }
  }
  return closed;
}
