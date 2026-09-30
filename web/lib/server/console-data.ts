import type { VoiceLatency } from "@core/agent/vapi";
import "server-only";
import { supabaseAdminClient } from "@/lib/supabase/admin";
import { watDay } from "@core/domain/format-time";

// The console's own read/write layer (SYSTEM-DESIGN.md §11.8) - every
// function here runs only on the server, through the service-role client,
// after a route or layout has already confirmed a signed-in staff user.

export interface OverviewData {
  todaysConversationCount: number;
  openEscalationCount: number;
  latestEvaluationRunId: string | null;
}

/** Midnight at the start of today in WAT - the day the console's "today" means. */
function startOfTodayWat(): string {
  return new Date(`${watDay(new Date())}T00:00:00+01:00`).toISOString();
}

/**
 * Where a conversation came from. Customer conversations belong to a
 * signed-in account; evaluation runs (evals/) create theirs with no account.
 * The console shows customers by default - evaluation traffic outnumbers
 * real conversations and would bury them.
 */
export type ConversationSource = "customers" | "evaluations";

export function parseSource(value: string | undefined): ConversationSource {
  return value === "evaluations" ? "evaluations" : "customers";
}

export async function getOverview(): Promise<OverviewData> {
  const supabase = supabaseAdminClient();
  const [{ count: todaysConversationCount }, { count: openEscalationCount }, { data: latestEvaluation }] = await Promise.all([
    supabase.from("conversations").select("*", { count: "exact", head: true }).not("caller_ref", "is", null).gte("started_at", startOfTodayWat()),
    supabase.from("escalations").select("id, conversations!inner(caller_ref)", { count: "exact", head: true }).not("conversations.caller_ref", "is", null).eq("status", "open"),
    supabase.from("evaluations").select("run_id").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return { todaysConversationCount: todaysConversationCount ?? 0, openEscalationCount: openEscalationCount ?? 0, latestEvaluationRunId: latestEvaluation?.run_id ?? null };
}

/** Who a conversation or case belongs to, as a support agent would want to read it. */
export interface Person {
  name: string;
  /** The company for a customer; "Staff" for a team member. */
  detail: string | null;
}

interface Directory {
  byAccount: Map<string, { name: string | null; email: string | null; staff: boolean }>;
  byCustomer: Map<string, { contact_name: string; company_name: string }>;
}

async function loadDirectory(): Promise<Directory> {
  const supabase = supabaseAdminClient();
  const [{ data: users }, { data: customers }] = await Promise.all([supabase.auth.admin.listUsers({ perPage: 1000 }), supabase.from("customers").select("customer_id, contact_name, company_name")]);
  const byAccount = new Map<string, { name: string | null; email: string | null; staff: boolean }>();
  for (const u of users?.users ?? []) {
    const name = typeof u.user_metadata?.name === "string" && u.user_metadata.name.trim() ? u.user_metadata.name.trim() : null;
    byAccount.set(u.id, { name, email: u.email ?? null, staff: u.app_metadata?.is_staff === true || Boolean(u.invited_at) });
  }
  const byCustomer = new Map((customers ?? []).map((c) => [c.customer_id as string, { contact_name: c.contact_name as string, company_name: c.company_name as string }]));
  return { byAccount, byCustomer };
}

function personFor(directory: Directory, callerRef: string | null, customerId: string | null): Person | null {
  const customer = customerId ? directory.byCustomer.get(customerId) : undefined;
  if (customer) return { name: customer.contact_name, detail: customer.company_name };
  const account = callerRef ? directory.byAccount.get(callerRef) : undefined;
  if (account) return { name: account.name ?? account.email ?? "Unknown account", detail: account.staff ? "Staff" : null };
  return null;
}

/** How a conversation ended, in a support agent's words. */
export type ConversationOutcome = "in_progress" | "escalated" | "ticket" | "resolved" | "abandoned" | "error" | "no_messages";

export function outcomeOf(c: { endedAt: string | null; finalStatus: string | null; escalated: boolean; ticketed: boolean; turns: number }): ConversationOutcome {
  if (!c.endedAt) return "in_progress";
  if (c.finalStatus === "error") return "error";
  if (c.escalated) return "escalated";
  if (c.ticketed) return "ticket";
  if (c.turns === 0) return "no_messages";
  if (c.finalStatus === "abandoned") return "abandoned";
  return "resolved";
}

export interface ConversationListItem {
  id: string;
  channel: string;
  started_at: string;
  ended_at: string | null;
  person: Person | null;
  opener: string | null;
  turns: number;
  outcome: ConversationOutcome;
  escalated: boolean;
}

export interface ConversationListFilters {
  channel?: string;
  escalated?: boolean;
  search?: string;
  source?: ConversationSource;
}

export async function listConversations(filters: ConversationListFilters = {}): Promise<ConversationListItem[]> {
  const supabase = supabaseAdminClient();
  let query = supabase.from("conversations").select("id, channel, caller_ref, verified_customer_id, started_at, ended_at, final_status, summary, conversation_turns(seq, user_transcript), escalations(id), support_tickets(id)").order("started_at", { ascending: false }).limit(200);
  if (filters.channel) query = query.eq("channel", filters.channel);
  query = (filters.source ?? "customers") === "customers" ? query.not("caller_ref", "is", null) : query.is("caller_ref", null);
  if (filters.search) query = query.ilike("summary", `%${filters.search}%`);

  const [{ data, error }, directory] = await Promise.all([query, loadDirectory()]);
  if (error) throw error;

  const rows: ConversationListItem[] = (data ?? []).map((row) => {
    const turns = [...(row.conversation_turns as Array<{ seq: number; user_transcript: string }>)].sort((a, b) => a.seq - b.seq);
    const escalated = (row.escalations as unknown[]).length > 0;
    const ticketed = (row.support_tickets as unknown[]).length > 0;
    const outcome = outcomeOf({ endedAt: row.ended_at as string | null, finalStatus: row.final_status as string | null, escalated, ticketed, turns: turns.length });
    return {
      id: row.id as string,
      channel: row.channel as string,
      started_at: row.started_at as string,
      ended_at: row.ended_at as string | null,
      person: personFor(directory, row.caller_ref as string | null, row.verified_customer_id as string | null),
      opener: turns[0]?.user_transcript ?? null,
      turns: turns.length,
      outcome,
      escalated,
    };
  });

  return filters.escalated === undefined ? rows : rows.filter((r) => r.escalated === filters.escalated);
}

export interface ConversationTurnDetail {
  id: string;
  seq: number;
  user_transcript: string;
  assistant_response: string;
  answer_type: string;
  answer_type_inferred: boolean;
  confidence: number | null;
  confidence_note: string | null;
  interrupted: boolean;
  ttft_ms: number | null;
  total_ms: number | null;
  tool_calls: Array<{ tool_name: string; input_summary: string | null; result_summary: string | null; status: string; duration_ms: number | null }>;
  retrieval: { query: string; source_titles: string[]; source_summaries: string[]; found: boolean } | null;
}

export interface ConversationDetail {
  id: string;
  channel: string;
  started_at: string;
  ended_at: string | null;
  final_status: string | null;
  ended_reason: string | null;
  model: string | null;
  cost_usd: number;
  /** Written when the conversation ends (agent-server lifecycle.ts); null while it's still open. */
  summary: string | null;
  /** Vapi's latency averages for a voice call (migration 017); null for chats. */
  voice_latency: VoiceLatency | null;
  person: Person | null;
  outcome: ConversationOutcome;
  verified_customer_company_name: string | null;
  turns: ConversationTurnDetail[];
  ticket: { id: string; category: string; status: string } | null;
  escalation: { id: string; category: string; status: string } | null;
}

export async function getConversationDetail(id: string): Promise<ConversationDetail | null> {
  const supabase = supabaseAdminClient();
  const { data: conversation, error } = await supabase.from("conversations").select("id, channel, caller_ref, started_at, ended_at, final_status, ended_reason, model, cost_usd, summary, voice_latency, verified_customer_id").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!conversation) return null;

  const [{ data: turns }, { data: toolCalls }, { data: retrievalLogs }, { data: ticket }, { data: escalation }, { data: customer }] = await Promise.all([
    supabase.from("conversation_turns").select("id, seq, user_transcript, assistant_response, answer_type, answer_type_inferred, confidence, confidence_note, interrupted, ttft_ms, total_ms").eq("conversation_id", id).order("seq", { ascending: true }),
    supabase.from("tool_calls").select("turn_seq, tool_name, input_summary, result_summary, status, duration_ms").eq("conversation_id", id),
    supabase.from("retrieval_logs").select("turn_seq, query, source_titles, source_summaries, found").eq("conversation_id", id),
    supabase.from("support_tickets").select("id, category, status").eq("conversation_id", id).maybeSingle(),
    supabase.from("escalations").select("id, category, status").eq("conversation_id", id).maybeSingle(),
    conversation.verified_customer_id ? supabase.from("customers").select("company_name").eq("customer_id", conversation.verified_customer_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const turnsWithDetail: ConversationTurnDetail[] = (turns ?? []).map((turn) => ({
    id: turn.id as string,
    seq: turn.seq as number,
    user_transcript: turn.user_transcript as string,
    assistant_response: turn.assistant_response as string,
    answer_type: turn.answer_type as string,
    answer_type_inferred: turn.answer_type_inferred as boolean,
    confidence: turn.confidence as number | null,
    confidence_note: turn.confidence_note as string | null,
    interrupted: turn.interrupted as boolean,
    ttft_ms: turn.ttft_ms as number | null,
    total_ms: turn.total_ms as number | null,
    tool_calls: (toolCalls ?? [])
      .filter((t) => t.turn_seq === turn.seq)
      .map((t) => ({ tool_name: t.tool_name as string, input_summary: t.input_summary as string | null, result_summary: t.result_summary as string | null, status: t.status as string, duration_ms: t.duration_ms as number | null })),
    retrieval: (() => {
      const log = (retrievalLogs ?? []).find((r) => r.turn_seq === turn.seq);
      return log ? { query: log.query as string, source_titles: log.source_titles as string[], source_summaries: log.source_summaries as string[], found: log.found as boolean } : null;
    })(),
  }));

  return {
    id: conversation.id as string,
    channel: conversation.channel as string,
    started_at: conversation.started_at as string,
    ended_at: conversation.ended_at as string | null,
    final_status: conversation.final_status as string | null,
    ended_reason: conversation.ended_reason as string | null,
    model: conversation.model as string | null,
    voice_latency: conversation.voice_latency as VoiceLatency | null,
    cost_usd: Number(conversation.cost_usd ?? 0),
    summary: (conversation.summary as string | null) ?? null,
    person: personFor(await loadDirectory(), conversation.caller_ref as string | null, conversation.verified_customer_id as string | null),
    outcome: outcomeOf({ endedAt: conversation.ended_at as string | null, finalStatus: conversation.final_status as string | null, escalated: Boolean(escalation), ticketed: Boolean(ticket), turns: turnsWithDetail.length }),
    verified_customer_company_name: (customer as { company_name?: string } | null)?.company_name ?? null,
    turns: turnsWithDetail,
    ticket: ticket ? { id: ticket.id as string, category: ticket.category as string, status: ticket.status as string } : null,
    escalation: escalation ? { id: escalation.id as string, category: escalation.category as string, status: escalation.status as string } : null,
  };
}

export type CasePriority = "urgent" | "high" | "medium" | "low";

export interface CaseItem {
  kind: "ticket" | "escalation";
  id: string;
  conversation_id: string;
  category: string;
  status: "open" | "in_progress" | "closed";
  priority: CasePriority;
  summary: string;
  person: Person | null;
  callback_time: string | null;
  created_at: string;
  updated_at: string;
}

export interface CaseListFilters {
  kind?: "ticket" | "escalation";
  status?: "open" | "in_progress" | "closed";
  source?: ConversationSource;
}

/** Filters a ticket or escalation query by its conversation's source. */
function bySource<Q extends { not: (column: string, operator: string, value: null) => Q; is: (column: string, value: null) => Q }>(query: Q, source: ConversationSource): Q {
  return source === "customers" ? query.not("conversations.caller_ref", "is", null) : query.is("conversations.caller_ref", null);
}

const PRIORITY_RANK: Record<CasePriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

/**
 * Open and in-progress cases first - most urgent, then oldest (first in,
 * first served) - then closed ones, most recently closed first.
 */
export function compareCases(a: CaseItem, b: CaseItem): number {
  const aClosed = a.status === "closed" ? 1 : 0;
  const bClosed = b.status === "closed" ? 1 : 0;
  if (aClosed !== bClosed) return aClosed - bClosed;
  if (aClosed) return b.updated_at.localeCompare(a.updated_at);
  return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.created_at.localeCompare(b.created_at);
}

/**
 * Tickets and escalations as one list of cases. Every escalation creates a
 * linked ticket (create-escalation.ts), which is the same case - so a ticket
 * that belongs to an escalation isn't listed on its own (it used to appear
 * as a second row with the same text).
 */
export async function listCases(filters: CaseListFilters = {}): Promise<CaseItem[]> {
  const supabase = supabaseAdminClient();
  const source = filters.source ?? "customers";
  const [ticketsResult, escalationsResult, directory] = await Promise.all([
    bySource(supabase.from("support_tickets").select("id, conversation_id, category, status, priority, summary, customer_id, created_at, updated_at, conversations!inner(caller_ref)"), source),
    bySource(supabase.from("escalations").select("id, ticket_id, conversation_id, category, status, reason, customer_id, callback_time, created_at, updated_at, conversations!inner(caller_ref)"), source),
    loadDirectory(),
  ]);
  if (ticketsResult.error) throw ticketsResult.error;
  if (escalationsResult.error) throw escalationsResult.error;

  const escalationRows = escalationsResult.data ?? [];
  const linkedTicketIds = new Set(escalationRows.map((e) => e.ticket_id as string | null).filter(Boolean));
  const callerOf = (row: { conversations: unknown }) => (row.conversations as { caller_ref: string | null } | null)?.caller_ref ?? null;

  const tickets: CaseItem[] = (ticketsResult.data ?? [])
    .filter((t) => !linkedTicketIds.has(t.id as string))
    .map((t) => ({
      kind: "ticket",
      id: t.id as string,
      conversation_id: t.conversation_id as string,
      category: t.category as string,
      status: t.status as CaseItem["status"],
      priority: t.priority as CasePriority,
      summary: t.summary as string,
      person: personFor(directory, callerOf(t), t.customer_id as string | null),
      callback_time: null,
      created_at: t.created_at as string,
      updated_at: t.updated_at as string,
    }));
  const escalations: CaseItem[] = escalationRows.map((e) => ({
    kind: "escalation",
    id: e.id as string,
    conversation_id: e.conversation_id as string,
    category: e.category as string,
    status: e.status as CaseItem["status"],
    priority: "high",
    summary: e.reason as string,
    person: personFor(directory, callerOf(e), e.customer_id as string | null),
    callback_time: e.callback_time as string | null,
    created_at: e.created_at as string,
    updated_at: e.updated_at as string,
  }));

  let all = [...tickets, ...escalations];
  if (filters.kind) all = all.filter((c) => c.kind === filters.kind);
  if (filters.status) all = all.filter((c) => c.status === filters.status);
  return all.sort(compareCases);
}

export interface CallbackDue {
  escalationId: string;
  conversationId: string;
  person: Person | null;
  category: string;
  callbackTime: string;
  overdue: boolean;
}

/** Escalations with a booked callback today (WAT) or earlier and still not closed - what a support team acts on first. */
export async function listCallbacksDue(now: Date = new Date()): Promise<CallbackDue[]> {
  const supabase = supabaseAdminClient();
  const today = watDay(now);
  const endOfToday = new Date(`${today}T23:59:59+01:00`).toISOString();
  const [{ data, error }, directory] = await Promise.all([
    supabase
      .from("escalations")
      .select("id, conversation_id, category, status, customer_id, callback_time, conversations!inner(caller_ref)")
      .not("conversations.caller_ref", "is", null)
      .neq("status", "closed")
      .not("callback_time", "is", null)
      .lte("callback_time", endOfToday)
      .order("callback_time"),
    loadDirectory(),
  ]);
  if (error) throw error;
  return (data ?? []).map((e) => ({
    escalationId: e.id as string,
    conversationId: e.conversation_id as string,
    person: personFor(directory, (e.conversations as unknown as { caller_ref: string | null } | null)?.caller_ref ?? null, e.customer_id as string | null),
    category: e.category as string,
    callbackTime: e.callback_time as string,
    overdue: watDay(e.callback_time as string) < today,
  }));
}

export type UpdateCaseResult = { ok: true; updated_at: string } | { ok: false; conflict: true } | { ok: false; conflict: false; error: string };

/** SYSTEM-DESIGN.md §11.5: "every change carries the row's updated_at. If someone else changed it first, [this returns] a conflict instead of overwriting it." */
export async function updateCaseStatus(kind: "ticket" | "escalation", id: string, newStatus: CaseItem["status"], expectedUpdatedAt: string): Promise<UpdateCaseResult> {
  const supabase = supabaseAdminClient();
  const table = kind === "ticket" ? "support_tickets" : "escalations";
  const { data, error } = await supabase.from(table).update({ status: newStatus }).eq("id", id).eq("updated_at", expectedUpdatedAt).select(kind === "escalation" ? "updated_at, ticket_id" : "updated_at").maybeSingle();
  if (error) return { ok: false, conflict: false, error: error.message };
  if (!data) return { ok: false, conflict: true };
  const row = data as unknown as { updated_at: string; ticket_id?: string | null };
  // An escalation and its linked ticket are one case in the queue, so they move together.
  if (row.ticket_id) await supabase.from("support_tickets").update({ status: newStatus }).eq("id", row.ticket_id);
  return { ok: true, updated_at: row.updated_at };
}

export interface EvaluationRunSummary {
  run_id: string;
  model: string;
  scenario_count: number;
  pass_count: number;
  created_at: string;
  cost_usd: number;
}

export async function listEvaluationRuns(): Promise<EvaluationRunSummary[]> {
  const supabase = supabaseAdminClient();
  const { data, error } = await supabase.from("evaluations").select("run_id, model, passed, cost_usd, created_at").order("created_at", { ascending: false });
  if (error) throw error;

  const byRun = new Map<string, EvaluationRunSummary>();
  for (const row of data ?? []) {
    const runId = row.run_id as string;
    const existing = byRun.get(runId);
    const passed = row.passed === true;
    const cost = Number(row.cost_usd ?? 0);
    if (existing) {
      existing.scenario_count++;
      if (passed) existing.pass_count++;
      existing.cost_usd += cost;
    } else {
      byRun.set(runId, { run_id: runId, model: row.model as string, scenario_count: 1, pass_count: passed ? 1 : 0, created_at: row.created_at as string, cost_usd: cost });
    }
  }
  return [...byRun.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export interface EvaluationScenarioResult {
  id: string;
  scenario: string;
  expected_behavior: string;
  actual_behavior: string | null;
  passed: boolean | null;
  checks: Array<{ check: string; passed: boolean }>;
  notes: string | null;
  conversation_id: string | null;
  ttft_ms: number | null;
  cost_usd: number;
}

export async function getEvaluationRun(runId: string): Promise<EvaluationScenarioResult[]> {
  const supabase = supabaseAdminClient();
  const { data, error } = await supabase.from("evaluations").select("id, scenario, expected_behavior, actual_behavior, passed, checks, notes, conversation_id, ttft_ms, cost_usd").eq("run_id", runId).order("scenario", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    scenario: row.scenario as string,
    expected_behavior: row.expected_behavior as string,
    actual_behavior: row.actual_behavior as string | null,
    passed: row.passed as boolean | null,
    checks: row.checks as Array<{ check: string; passed: boolean }>,
    notes: row.notes as string | null,
    conversation_id: row.conversation_id as string | null,
    ttft_ms: row.ttft_ms as number | null,
    cost_usd: Number(row.cost_usd ?? 0),
  }));
}
