// The public voice link's spend limits (SYSTEM-DESIGN.md §9): 3 calls a
// day per visitor. The 3-concurrent-sessions cap is enforced separately,
// in-process, by agent-server's SessionManager (it's a property of the one
// running process, not something a database query answers).
import type { SupabaseClient } from "@supabase/supabase-js";

export const DAILY_CALL_LIMIT = 3;

export type LimitCheck = { allowed: true } | { allowed: false; reason: "daily_limit_reached" };

function startOfTodayUtc(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

/** Today's conversation count for this visitor - the raw number `checkVisitorDailyLimit` compares against `DAILY_CALL_LIMIT`, also exposed directly so the voice page can show "X of 3 calls used today" before a caller ever hits the limit. */
export async function countVisitorConversationsToday(supabase: SupabaseClient, callerRef: string, now: Date = new Date()): Promise<number> {
  const { count, error } = await supabase.from("conversations").select("*", { count: "exact", head: true }).eq("caller_ref", callerRef).gte("started_at", startOfTodayUtc(now));
  if (error) throw error;
  return count ?? 0;
}

export async function checkVisitorDailyLimit(supabase: SupabaseClient, callerRef: string, now: Date = new Date()): Promise<LimitCheck> {
  const count = await countVisitorConversationsToday(supabase, callerRef, now);
  if (count >= DAILY_CALL_LIMIT) return { allowed: false, reason: "daily_limit_reached" };
  return { allowed: true };
}
