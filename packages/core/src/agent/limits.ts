// Per-account usage limits (SYSTEM-DESIGN.md §9). Voice and text are
// limited separately and never count against each other: calls cost Vapi
// minutes as well as Claude turns, so they're limited per call; chat costs
// only Claude turns, so it's limited per message. The concurrency caps are
// enforced separately, in-process, by agent-server's SessionManager.
import type { SupabaseClient } from "@supabase/supabase-js";

export const DAILY_CALL_LIMIT = 5;
export const CHAT_MESSAGE_MAX_CHARS = 1000;
export const CHAT_MESSAGES_PER_CONVERSATION = 30;
export const CHAT_MESSAGES_PER_DAY = 90;

export type Channel = "web_voice" | "web_text" | "phone";
const VOICE_CHANNELS: Channel[] = ["web_voice", "phone"];

export type LimitCheck = { allowed: true } | { allowed: false; reason: "daily_limit_reached" };

export function startOfTodayUtc(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

/** Today's voice calls for this account (chats don't count). */
export async function countVisitorConversationsToday(supabase: SupabaseClient, callerRef: string, now: Date = new Date()): Promise<number> {
  const { count, error } = await supabase
    .from("conversations")
    .select("*", { count: "exact", head: true })
    .eq("caller_ref", callerRef)
    .in("channel", VOICE_CHANNELS)
    .gte("started_at", startOfTodayUtc(now));
  if (error) throw error;
  return count ?? 0;
}

export async function checkVisitorDailyLimit(supabase: SupabaseClient, callerRef: string, now: Date = new Date()): Promise<LimitCheck> {
  const count = await countVisitorConversationsToday(supabase, callerRef, now);
  if (count >= DAILY_CALL_LIMIT) return { allowed: false, reason: "daily_limit_reached" };
  return { allowed: true };
}

/** Chat messages this account has sent today, across all its text conversations. */
export async function countChatMessagesToday(supabase: SupabaseClient, callerRef: string, now: Date = new Date()): Promise<number> {
  const { count, error } = await supabase
    .from("conversation_turns")
    .select("id, conversations!inner(caller_ref, channel)", { count: "exact", head: true })
    .eq("conversations.caller_ref", callerRef)
    .eq("conversations.channel", "web_text")
    .gte("created_at", startOfTodayUtc(now));
  if (error) throw error;
  return count ?? 0;
}

export type ChatMessageRefusal = "message_too_long" | "conversation_message_limit" | "chat_daily_limit";

/** The chat limits for one new message, given what's already been sent. `messagesToday` is null for conversations with no account (evaluation runs). */
export function checkChatMessage(args: { messageLength: number; messagesInConversation: number; messagesToday: number | null }): ChatMessageRefusal | null {
  if (args.messageLength > CHAT_MESSAGE_MAX_CHARS) return "message_too_long";
  if (args.messagesInConversation >= CHAT_MESSAGES_PER_CONVERSATION) return "conversation_message_limit";
  if (args.messagesToday !== null && args.messagesToday >= CHAT_MESSAGES_PER_DAY) return "chat_daily_limit";
  return null;
}
