// Operational notifications that aren't tied to one conversation: callers
// turned away, accounts reaching a limit, the daily spend threshold and
// the daily digest. `ops_alerts` (migration 012) is the "already sent"
// record, keyed per day, so a restart or a second process never sends the
// same one twice; `ops_events` (migration 015) is what the digest counts.
import type { SupabaseClient } from "@supabase/supabase-js";
import { startOfTodayUtc } from "@core/agent";
import { capacityMessage, dailyDigestMessage, limitReachedMessage, sendDiscordActivity, sendDiscordAlert, spendThresholdMessage } from "@core/notify/discord";
import type { Pool } from "./session-manager";
import { isFailedTurn } from "./lifecycle";

const UNIQUE_VIOLATION = "23505";
const CAPACITY_ALERT_EVERY_MS = 10 * 60_000;
export const DIGEST_HOUR_UTC = 7;

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** True the first time `key` is claimed, false every time after. */
export async function claimOnce(supabase: SupabaseClient, key: string): Promise<boolean> {
  const { error } = await supabase.from("ops_alerts").insert({ key });
  if (!error) return true;
  if (error.code === UNIQUE_VIOLATION) return false;
  throw error;
}

export async function recordOpsEvent(supabase: SupabaseClient, kind: string, detail: Record<string, unknown>): Promise<void> {
  await supabase.from("ops_events").insert({ kind, detail });
}

export class OpsNotifier {
  private lastCapacityAlert: Partial<Record<Pool, number>> = {};

  constructor(
    private readonly supabase: SupabaseClient,
    private readonly spendThresholdUsd: number,
  ) {}

  /** Every rejection is counted for the digest; at most one alert per pool per 10 minutes. */
  async capacityRejected(pool: Pool, limit: number, now: number = Date.now()): Promise<void> {
    await recordOpsEvent(this.supabase, "capacity_rejected", { pool }).catch(() => undefined);
    const last = this.lastCapacityAlert[pool] ?? 0;
    if (now - last < CAPACITY_ALERT_EVERY_MS) return;
    this.lastCapacityAlert[pool] = now;
    await sendDiscordAlert(capacityMessage({ pool, limit }));
  }

  /** Once per account per kind per day. The account id is only a dedupe key - it's never posted. */
  async limitReached(kind: "calls" | "chat", callerRef: string, limit: number, now: Date = new Date()): Promise<void> {
    if (!(await claimOnce(this.supabase, `limit:${kind}:${callerRef}:${utcDay(now)}`).catch(() => false))) return;
    await recordOpsEvent(this.supabase, "limit_reached", { kind }).catch(() => undefined);
    await sendDiscordActivity(limitReachedMessage({ kind, limit }));
  }

  async checkDailySpend(now: Date = new Date()): Promise<void> {
    if (!(this.spendThresholdUsd > 0)) return;
    const spent = await claudeSpendBetween(this.supabase, startOfTodayUtc(now), now.toISOString());
    if (spent < this.spendThresholdUsd) return;
    if (!(await claimOnce(this.supabase, `spend:${utcDay(now)}`))) return;
    await sendDiscordAlert(spendThresholdMessage({ spentUsd: spent, thresholdUsd: this.spendThresholdUsd }));
  }

  /** Yesterday's digest, sent once after DIGEST_HOUR_UTC. Skipped for a day with no activity at all. */
  async maybeSendDailyDigest(now: Date = new Date()): Promise<boolean> {
    if (now.getUTCHours() < DIGEST_HOUR_UTC) return false;
    const todayStart = startOfTodayUtc(now);
    const yesterdayStart = new Date(new Date(todayStart).getTime() - 24 * 60 * 60_000).toISOString();
    const day = yesterdayStart.slice(0, 10);
    if (!(await claimOnce(this.supabase, `digest:${day}`))) return false;

    const digest = await buildDigest(this.supabase, day, yesterdayStart, todayStart);
    const empty = digest.voiceCalls + digest.chats + digest.escalations + digest.tickets + digest.turnedAway === 0 && digest.claudeSpendUsd === 0;
    if (empty) return false;
    await sendDiscordActivity(dailyDigestMessage(digest));
    return true;
  }
}

async function claudeSpendBetween(supabase: SupabaseClient, from: string, to: string): Promise<number> {
  const { data, error } = await supabase.from("conversation_turns").select("cost_usd").gte("created_at", from).lt("created_at", to);
  if (error) throw error;
  return ((data ?? []) as Array<{ cost_usd: number | null }>).reduce((sum, r) => sum + Number(r.cost_usd ?? 0), 0);
}

async function countRows(query: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export async function buildDigest(supabase: SupabaseClient, day: string, from: string, to: string) {
  // Conversations with an account only - evaluation runs (no account) are
  // left out of the activity counts, though their spend is real and counted.
  const byChannel = (channels: string[]) =>
    countRows(supabase.from("conversations").select("id", { count: "exact", head: true }).in("channel", channels).not("caller_ref", "is", null).gte("started_at", from).lt("started_at", to));

  const [voiceCalls, chats, turnsRes, escalations, tickets, turnedAway, claudeSpendUsd, latestRun] = await Promise.all([
    byChannel(["web_voice", "phone"]),
    byChannel(["web_text"]),
    supabase.from("conversation_turns").select("answer_type_inferred, confidence_note, conversations!inner(caller_ref)").not("conversations.caller_ref", "is", null).gte("created_at", from).lt("created_at", to),
    countRows(supabase.from("escalations").select("id, conversations!inner(caller_ref)", { count: "exact", head: true }).not("conversations.caller_ref", "is", null).gte("created_at", from).lt("created_at", to)),
    countRows(supabase.from("support_tickets").select("id, conversations!inner(caller_ref)", { count: "exact", head: true }).not("conversations.caller_ref", "is", null).gte("created_at", from).lt("created_at", to)),
    countRows(supabase.from("ops_events").select("id", { count: "exact", head: true }).eq("kind", "capacity_rejected").gte("created_at", from).lt("created_at", to)),
    claudeSpendBetween(supabase, from, to),
    supabase.from("evaluations").select("run_id").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (turnsRes.error) throw turnsRes.error;
  const turns = (turnsRes.data ?? []) as Array<{ answer_type_inferred: boolean; confidence_note: string | null }>;

  let latestEvaluation: { passed: number; total: number; runId: string } | null = null;
  const runId = (latestRun.data as { run_id: string } | null)?.run_id;
  if (runId) {
    const { data: rows } = await supabase.from("evaluations").select("passed").eq("run_id", runId);
    const list = (rows ?? []) as Array<{ passed: boolean | null }>;
    latestEvaluation = { runId, total: list.length, passed: list.filter((r) => r.passed).length };
  }

  return { day, voiceCalls, chats, turns: turns.length, escalations, tickets, turnedAway, failedTurns: turns.filter(isFailedTurn).length, claudeSpendUsd, latestEvaluation };
}
