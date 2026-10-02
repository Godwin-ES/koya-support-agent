// @vitest-environment node
//
// Every MCP tool's rules (SYSTEM-DESIGN.md §5), run against the real seed
// data and a real, disposable conversation per test - not mocked, per this
// project's own convention (Task 3). search_knowledge is covered
// separately (tests/retrieval/labelled-set.test.ts, Task 4) since it needs
// the local embeddings model; everything here is $0 (no embeddings, no
// Claude, no Vapi).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceRoleClient } from "../helpers/db";
import type { ToolContext } from "@core/mcp/context";
import { createEscalation } from "@core/mcp/tools/create-escalation";
import { createSupportTicket } from "@core/mcp/tools/create-support-ticket";
import { logConversationEvent } from "@core/mcp/tools/log-conversation-event";
import { lookupCustomer } from "@core/mcp/tools/lookup-customer";
import { lookupPayout } from "@core/mcp/tools/lookup-payout";
import { listAccountActivity } from "@core/mcp/tools/list-account-activity";
import { lookupTransaction } from "@core/mcp/tools/lookup-transaction";

const supabase: SupabaseClient = serviceRoleClient();
let context: ToolContext;

beforeEach(async () => {
  const { data, error } = await supabase.from("conversations").insert({ channel: "web_text" }).select("id").single();
  if (error) throw error;
  context = { supabase, conversationId: data.id as string };
});

afterEach(async () => {
  // Cascades to conversation_turns/events, retrieval_logs, tool_calls,
  // support_tickets and escalations for this conversation (migrations 002-003).
  await supabase.from("conversations").delete().eq("id", context.conversationId);
});

/** Binds the test conversation to a customer, the way agent-server does from the signed-in account. */
async function signInAs(customerId: string | null): Promise<void> {
  await supabase.from("conversations").update({ verified_customer_id: customerId }).eq("id", context.conversationId);
}

async function advanceTurn(): Promise<void> {
  const { count } = await supabase.from("conversation_turns").select("*", { count: "exact", head: true }).eq("conversation_id", context.conversationId);
  const { error } = await supabase.from("conversation_turns").insert({
    conversation_id: context.conversationId,
    seq: (count ?? 0) + 1,
    user_transcript: "Yes, please go ahead.",
    assistant_response: "Confirmed.",
    answer_type: "clarify",
  });
  if (error) throw error;
}

async function confirmTicket(input: Parameters<typeof createSupportTicket>[1]) {
  const proposal = await createSupportTicket(context, input) as { confirmation_key: string };
  await advanceTurn();
  return createSupportTicket(context, { ...input, confirmed: true, confirmation_key: proposal.confirmation_key });
}

async function confirmEscalation(input: Parameters<typeof createEscalation>[1]) {
  const proposal = await createEscalation(context, input) as { confirmation_key: string };
  await advanceTurn();
  return createEscalation(context, { ...input, confirmed: true, confirmation_key: proposal.confirmation_key });
}

describe("account binding - a caller only ever sees their own records", () => {
  it("refuses every private lookup and support write in trusted guest scope", async () => {
    const guest = { ...context, accessScope: "guest" as const };
    const refusal = { refused: true, reason: "guest_scope" };
    expect(await lookupCustomer(guest, {})).toEqual(refusal);
    expect(await lookupTransaction(guest, { transaction_id: "TXN-9001" })).toEqual(refusal);
    expect(await lookupPayout(guest, { payout_id: "PAY-7001" })).toEqual(refusal);
    expect(await listAccountActivity(guest)).toEqual(refusal);
    expect(await createSupportTicket(guest, { category: "other", priority: "medium", summary: "x" })).toEqual(refusal);
    expect(await createEscalation(guest, { category: "other", reason: "x", user_name: "A", user_email: "a@example.com" })).toEqual(refusal);
    expect((await supabase.from("support_tickets").select("id", { count: "exact", head: true }).eq("conversation_id", context.conversationId)).count).toBe(0);
  });

  it("lookup_customer returns the signed-in customer, with no identifiers needed", async () => {
    await signInAs("CUS-1001");
    expect(await lookupCustomer(context, {})).toMatchObject({ found: true, customer_id: "CUS-1001", company_name: "LagosLedger", contact_name: "Amara Okafor" });
  });

  it("naming another customer never switches whose account it is (\"I'm Efua from AccraStack\" while signed in as Amara)", async () => {
    await signInAs("CUS-1001");
    expect(await lookupCustomer(context, { company_name: "AccraStack", contact_name: "Efua" })).toMatchObject({ found: false, reason: "not_this_account" });
    const { data } = await supabase.from("conversations").select("verified_customer_id").eq("id", context.conversationId).single();
    expect(data!.verified_customer_id).toBe("CUS-1001");
  });

  it("a login with no customer account gets no account data at all", async () => {
    await signInAs(null);
    expect(await lookupCustomer(context, { company_name: "LagosLedger", contact_name: "Amara" })).toMatchObject({ found: false, reason: "no_customer_account" });
    expect(await lookupTransaction(context, { transaction_id: "TXN-9001" })).toMatchObject({ found: false, reason: "no_customer_account" });
    expect(await lookupPayout(context, { payout_id: "PAY-7001" })).toMatchObject({ found: false, reason: "no_customer_account" });
    expect(await listAccountActivity(context)).toMatchObject({ found: false, reason: "no_customer_account" });
  });

  it("never returns the internal support_notes text, only a derived guidance", async () => {
    await signInAs("CUS-1003");
    const result = await lookupCustomer(context, {});
    expect(JSON.stringify(result)).not.toMatch(/compliance review\. Escalate/i);
    expect(result).toMatchObject({ found: true, guidance: expect.stringMatching(/restricted/i) });
  });

  it("lookup_transaction returns full detail for the caller's own transaction", async () => {
    await signInAs("CUS-1001");
    expect(await lookupTransaction(context, { transaction_id: "TXN-9001" })).toMatchObject({ found: true, status: "processing", amount: 2400, currency: "USD" });
  });

  it("normalises a spoken reference before looking up", async () => {
    await signInAs("CUS-1001");
    expect(await lookupTransaction(context, { transaction_id: "txn 9001" })).toMatchObject({ found: true, transaction_id: "TXN-9001" });
  });

  it("another customer's transaction and a made-up one get the same answer - not even the status leaks", async () => {
    await signInAs("CUS-1001");
    const others = await lookupTransaction(context, { transaction_id: "TXN-9003" });
    const madeUp = await lookupTransaction(context, { transaction_id: "TXN-0000" });
    expect(others).toEqual(madeUp);
    expect(others).toMatchObject({ found: false, reason: "not_on_this_account" });
  });

  it("flags the caller's own review-required transaction for escalation", async () => {
    await signInAs("CUS-1003");
    expect(await lookupTransaction(context, { transaction_id: "TXN-9003" })).toMatchObject({ found: true, status: "review required", guidance: "escalate" });
  });

  it("lookup_payout: own payout by payout id or transaction id, with a composed summary; another customer's is not on this account", async () => {
    await signInAs("CUS-1004");
    expect(await lookupPayout(context, { transaction_id: "TXN-9004" })).toMatchObject({ found: true, payout_id: "PAY-7003", support_summary: "Payout is failed. Reason: beneficiary details need review." });
    expect(await lookupPayout(context, { payout_id: "PAY-7001" })).toMatchObject({ found: false, reason: "not_on_this_account" });
  });

  it("list_account_activity: only the signed-in customer's own transactions and payouts, customer-safe, with what needs attention counted", async () => {
    await signInAs("CUS-1004");
    const result = await listAccountActivity(context);
    expect(result).toMatchObject({ found: true, transactions: [{ transaction_id: "TXN-9004" }], payouts: [{ payout_id: "PAY-7003", support_summary: "Payout is failed. Reason: beneficiary details need review." }] });
    if (!result.found) throw new Error("expected activity");
    expect(result.needs_attention).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(result)).not.toMatch(/recipient|CUS-100[^4]/);
    await signInAs("CUS-1003");
    const efua = await listAccountActivity(context);
    expect(efua).toMatchObject({ found: true, transactions: [{ transaction_id: "TXN-9003", guidance: "escalate" }] });
  });

  it("tickets and escalations are filed against the signed-in customer, whatever customer_id the model passes, and use the account's name and email", async () => {
    await signInAs("CUS-1001");
    await confirmTicket({ customer_id: "CUS-1003", category: "payment", priority: "high", summary: "s" });
    const escalation = await confirmEscalation({ customer_id: "CUS-1003", category: "account", reason: "r" });
    expect(escalation).toMatchObject({ status: "open" });
    const { data: ticket } = await supabase.from("support_tickets").select("customer_id").eq("conversation_id", context.conversationId).eq("category", "payment").single();
    const { data: esc } = await supabase.from("escalations").select("customer_id, user_name, user_email").eq("conversation_id", context.conversationId).single();
    expect(ticket!.customer_id).toBe("CUS-1001");
    expect(esc).toEqual({ customer_id: "CUS-1001", user_name: "Amara Okafor", user_email: "amara@lagosledger.example" });
  });
});

describe("create_support_ticket", () => {
  it("proposes first and only creates after a matching confirmation on a later turn", async () => {
    const details = { category: "payment", priority: "high", summary: "Payout PAY-7001 has not arrived." };
    const proposal = await createSupportTicket(context, details) as { confirmation_required: true; confirmation_key: string };
    expect(proposal.confirmation_required).toBe(true);
    expect(proposal.confirmation_key).toEqual(expect.any(String));
    expect((await supabase.from("support_tickets").select("id", { count: "exact", head: true }).eq("conversation_id", context.conversationId)).count).toBe(0);

    expect(await createSupportTicket(context, { ...details, confirmed: true, confirmation_key: proposal.confirmation_key })).toMatchObject({ refused: true, reason: "confirmation_must_follow_proposal" });
    await advanceTurn();
    expect(await createSupportTicket(context, { ...details, summary: "Changed details", confirmed: true, confirmation_key: proposal.confirmation_key })).toMatchObject({ refused: true, reason: "proposal_mismatch" });

    const created = await createSupportTicket(context, { ...details, confirmed: true, confirmation_key: proposal.confirmation_key });
    expect(created).toMatchObject({ status: "open", ticket_id: expect.any(String) });
    const retried = await createSupportTicket(context, { ...details, confirmed: true, confirmation_key: proposal.confirmation_key });
    expect(retried).toEqual(created);
  });

  it("refuses a confirmation that has no matching proposal", async () => {
    expect(await createSupportTicket(context, { category: "other", priority: "medium", summary: "Help", confirmed: true, confirmation_key: "missing" })).toMatchObject({ refused: true, reason: "proposal_not_found" });
  });

  it("creates a ticket and returns it open", async () => {
    const result = await confirmTicket({ category: "payment", priority: "medium", summary: "Caller asked about a delayed payout." });
    expect(result).toMatchObject({ status: "open" });
  });

  it("is idempotent per conversation and category - a repeat returns the same ticket", async () => {
    const details = { category: "payment", priority: "medium", summary: "First report." };
    const proposal = await createSupportTicket(context, details) as { confirmation_key: string };
    await advanceTurn();
    const first = await createSupportTicket(context, { ...details, confirmed: true, confirmation_key: proposal.confirmation_key });
    const second = await createSupportTicket(context, { ...details, confirmed: true, confirmation_key: proposal.confirmation_key });
    expect("ticket_id" in first && "ticket_id" in second && first.ticket_id === second.ticket_id).toBe(true);
  });

  it("allows a different category to open its own ticket in the same conversation", async () => {
    const a = await confirmTicket({ category: "payment", priority: "medium", summary: "Payment issue." });
    const b = await confirmTicket({ category: "dispute", priority: "medium", summary: "Separate dispute." });
    expect("ticket_id" in a && "ticket_id" in b && a.ticket_id !== b.ticket_id).toBe(true);
  });

  it("refuses an invalid category", async () => {
    const result = await createSupportTicket(context, { category: "billing", priority: "medium", summary: "x" });
    expect(result).toEqual({ refused: true, reason: "invalid_category" });
  });

  it("refuses an invalid priority", async () => {
    const result = await createSupportTicket(context, { category: "other", priority: "critical", summary: "x" });
    expect(result).toEqual({ refused: true, reason: "invalid_priority" });
  });
});

describe("create_escalation", () => {
  it("reads back the full callback details and books only after later confirmation", async () => {
    const details = { user_name: "A", user_email: "a@example.com", category: "other", reason: "Needs a specialist.", preferred_time: "2026-10-05T14:00:00+01:00", preferred_time_source: "Monday at 2 PM" };
    const proposal = await createEscalation(context, details) as { confirmation_required: true; confirmation_key: string; confirmation_summary: string };
    expect(proposal).toMatchObject({ confirmation_required: true, confirmation_key: expect.any(String), confirmation_summary: expect.stringContaining("Monday, October 5 at 2:00 PM WAT") });
    expect((await supabase.from("escalations").select("id", { count: "exact", head: true }).eq("conversation_id", context.conversationId)).count).toBe(0);
    await advanceTurn();
    expect(await createEscalation(context, { ...details, confirmed: true, confirmation_key: proposal.confirmation_key })).toMatchObject({ status: "open", follow_up_summary: expect.stringContaining("Monday, October 5 at 2:00 PM WAT") });
  });

  it("refuses an ambiguous spoken time before creating a proposal", async () => {
    expect(await createEscalation(context, {
      user_name: "A",
      user_email: "a@example.com",
      category: "other",
      reason: "Needs a specialist.",
      preferred_time: "2026-10-05T14:00:00+01:00",
      preferred_time_source: "next Monday by 2",
    })).toMatchObject({ refused: true, reason: "missing_time_period" });
  });

  it.each([
    ["2026-10-05T08:30:00+01:00", "outside_business_hours"],
    ["2026-10-03T10:00:00+01:00", "weekend"],
    ["2026-10-01T10:00:00+01:00", "past_time"],
    ["2026-10-05T10:00:00", "invalid_time"],
  ])("refuses invalid callback slot %s", async (preferred_time, reason) => {
    expect(await createEscalation(context, { user_name: "A", user_email: "a@example.com", category: "other", reason: "r", preferred_time, preferred_time_source: "at 10 AM" })).toMatchObject({ refused: true, reason });
  });

  it("enforces exact and partial callback overlaps atomically without orphan tickets", async () => {
    const extraConversationIds: string[] = [];
    const createConversation = async () => {
      const { data, error } = await supabase.from("conversations").insert({ channel: "web_text" }).select("id").single();
      if (error) throw error;
      extraConversationIds.push(data.id as string);
      return data.id as string;
    };
    const book = async (conversationId: string, callbackTime: string) => {
      const { data, error } = await supabase.rpc("create_confirmed_escalation", {
        p_conversation_id: conversationId,
        p_customer_id: null,
        p_user_name: "Test Caller",
        p_user_email: "caller@example.com",
        p_category: "other",
        p_reason: "Requested a callback.",
        p_callback_time: callbackTime,
        p_ticket_id: null,
      });
      if (error) throw error;
      return (data as Array<{ outcome: "created" | "existing" | "slot_unavailable" }>)[0]!.outcome;
    };

    try {
      expect(await book(context.conversationId, "2026-11-02T14:00:00+01:00")).toBe("created");
      expect(await book(await createConversation(), "2026-11-02T14:15:00+01:00")).toBe("slot_unavailable");
      expect(await book(await createConversation(), "2026-11-02T14:30:00+01:00")).toBe("created");

      const concurrentIds = [await createConversation(), await createConversation()];
      const outcomes = await Promise.all(concurrentIds.map((id) => book(id, "2026-11-03T10:00:00+01:00")));
      expect([...outcomes].sort()).toEqual(["created", "slot_unavailable"]);

      const losingConversationId = concurrentIds[outcomes.indexOf("slot_unavailable")];
      const { count, error } = await supabase
        .from("support_tickets")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", losingConversationId);
      if (error) throw error;
      expect(count).toBe(0);
    } finally {
      if (extraConversationIds.length > 0) {
        await supabase.from("conversations").delete().in("id", extraConversationIds);
      }
    }
  });

  it("creates an escalation, a linked ticket, and a follow_up_summary", async () => {
    const result = await confirmEscalation({
      user_name: "Test Caller",
      user_email: "caller@example.com",
      category: "dispute",
      reason: "Wants a refund investigated.",
    });
    expect(result).toMatchObject({ status: "open", follow_up_summary: expect.any(String) });
  });

  it("is idempotent per conversation - a repeat returns the existing open escalation", async () => {
    const first = await confirmEscalation({ user_name: "A", user_email: "a@example.com", category: "account", reason: "r1" });
    const second = await confirmEscalation({ user_name: "A", user_email: "a@example.com", category: "account", reason: "r2, mentioned again" });
    expect("escalation_id" in first && "escalation_id" in second && first.escalation_id === second.escalation_id).toBe(true);
  });

  it("refuses a malformed email", async () => {
    const result = await createEscalation(context, { user_name: "A", user_email: "not-an-email", category: "account", reason: "r" });
    expect(result).toEqual({ refused: true, reason: "invalid_email" });
  });

  it("refuses a category outside escalation-rules.md's five", async () => {
    const result = await createEscalation(context, { user_name: "A", user_email: "a@example.com", category: "billing", reason: "r" });
    expect(result).toEqual({ refused: true, reason: "invalid_category" });
  });

  it("books a call only when a preferred_time is given", async () => {
    const preferredTime = "2026-10-06T10:00:00+01:00";
    const booked = await confirmEscalation({ user_name: "A", user_email: "a@example.com", category: "other", reason: "r", preferred_time: preferredTime, preferred_time_source: "Monday at 2 PM" });
    expect("follow_up_summary" in booked && booked.follow_up_summary).toContain("Tuesday, October 6 at 10:00 AM WAT");
  });

  it("refuses a preferred_time that isn't a machine-readable timestamp - callback_time is timestamptz, not free text", async () => {
    const result = await createEscalation(context, { user_name: "A", user_email: "a@example.com", category: "other", reason: "r", preferred_time: "tomorrow 10am", preferred_time_source: "tomorrow at 10 AM" });
    expect(result).toMatchObject({ refused: true, reason: "invalid_time" });
    expect((result as { hint?: string }).hint).toMatch(/ISO-8601/);
  });
});

describe("log_conversation_event", () => {
  it("writes a conversation_events row and returns logged: true", async () => {
    const result = await logConversationEvent(context, { event_type: "decision", summary: "Declared answer_type=clarify.", metadata: { answer_type: "clarify" } });
    expect(result).toEqual({ logged: true });
    const { data } = await supabase.from("conversation_events").select("event_type, summary").eq("conversation_id", context.conversationId).single();
    expect(data).toMatchObject({ event_type: "decision", summary: "Declared answer_type=clarify." });
  });
});
