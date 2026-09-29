// The public voice link's spend limits (SYSTEM-DESIGN.md §9): 3 calls a
// day per visitor. The 3-concurrent-sessions cap is enforced separately,
// in-process, by agent-server's SessionManager (it's a property of the one
// running process, not something a database query answers).
import type { SupabaseClient } from "@supabase/supabase-js";

const DAILY_CALL_LIMIT = 3;

export type LimitCheck = { allowed: true } | { allowed: false; reason: "daily_limit_reached" };

function startOfTodayUtc(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

export async function checkVisitorDailyLimit(supabase: SupabaseClient, callerRef: string, now: Date = new Date()): Promise<LimitCheck> {
  const { count, error } = await supabase.from("conversations").select("*", { count: "exact", head: true }).eq("caller_ref", callerRef).gte("started_at", startOfTodayUtc(now));
  if (error) throw error;
  if ((count ?? 0) >= DAILY_CALL_LIMIT) return { allowed: false, reason: "daily_limit_reached" };
  return { allowed: true };
}
