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

describe("lookup_customer", () => {
  it("refuses a single identifier - not_enough_to_verify", async () => {
    const result = await lookupCustomer(context, { company_name: "LagosLedger" });
    expect(result).toEqual({ found: false, reason: "not_enough_to_verify" });
  });

  it("verifies on company name + full contact name", async () => {
    const result = await lookupCustomer(context, { company_name: "LagosLedger", contact_name: "Amara Okafor" });
    expect(result).toMatchObject({ found: true, customer_id: "CUS-1001", company_name: "LagosLedger" });
  });

  it("verifies on a first name alone ('I am Amara from LagosLedger') - the PRD's own scenario 3 wording, found failing this by Task 12's evaluation run", async () => {
    const result = await lookupCustomer(context, { company_name: "LagosLedger", contact_name: "Amara" });
    expect(result).toMatchObject({ found: true, customer_id: "CUS-1001" });
  });

  it("does not verify on a name that isn't even a prefix of the real contact name", async () => {
    const result = await lookupCustomer(context, { company_name: "LagosLedger", contact_name: "Daniel" });
    expect(result).toEqual({ found: false, reason: "not_found" });
  });

  it("company_name still requires an exact match - the first-name relaxation doesn't loosen the other identifier", async () => {
    const result = await lookupCustomer(context, { company_name: "Lagos", contact_name: "Amara Okafor" });
    expect(result).toEqual({ found: false, reason: "not_found" });
  });

  it("is case-insensitive on company/contact/email but not on customer_id", async () => {
    const result = await lookupCustomer(context, { company_name: "lagosledger", email: "AMARA@LAGOSLEDGER.EXAMPLE" });
    expect(result).toMatchObject({ found: true, customer_id: "CUS-1001" });
  });

  it("does not verify two identifiers that belong to two different customers", async () => {
    const result = await lookupCustomer(context, { company_name: "LagosLedger", email: "daniel@nairobiops.example" });
    expect(result).toEqual({ found: false, reason: "not_found" });
  });

  it("never returns the internal support_notes text, only a derived guidance", async () => {
    // CUS-1003's real support_notes mentions compliance review - must not appear verbatim.
    const result = await lookupCustomer(context, { customer_id: "CUS-1003", company_name: "AccraStack" });
    expect(result).toMatchObject({ found: true, guidance: expect.stringContaining("escalate") });
    expect(JSON.stringify(result)).not.toContain("Account is under compliance review");
  });

  it("marks the conversation's verified_customer_id on a match", async () => {
    await lookupCustomer(context, { customer_id: "CUS-1001", company_name: "LagosLedger" });
    const { data } = await supabase.from("conversations").select("verified_customer_id").eq("id", context.conversationId).single();
    expect(data?.verified_customer_id).toBe("CUS-1001");
  });
});

describe("lookup_transaction", () => {
  it("returns not_found for an unknown reference", async () => {
    const result = await lookupTransaction(context, { transaction_id: "TXN-0000" });
    expect(result).toEqual({ found: false, reason: "not_found" });
  });

  it("normalises a spoken reference before looking up", async () => {
    const result = await lookupTransaction(context, { transaction_id: "TXN nine zero zero one" });
    expect(result).toMatchObject({ found: true, transaction_id: "TXN-9001" });
  });

  it("returns status only, plus guidance, for an unverified caller", async () => {
    const result = await lookupTransaction(context, { transaction_id: "TXN-9001" });
    expect(result).toEqual({ found: true, transaction_id: "TXN-9001", status: "processing", guidance: "verify caller for details" });
  });

  it("returns amount, currency and destination once the caller is verified as that transaction's own customer", async () => {
    await lookupCustomer(context, { customer_id: "CUS-1001", company_name: "LagosLedger" });
    const result = await lookupTransaction(context, { transaction_id: "TXN-9001" });
    expect(result).toMatchObject({ found: true, amount: 2400, currency: "USD", destination_country: "Kenya" });
  });

  it("does not reveal amount for a transaction belonging to a different verified customer", async () => {
    await lookupCustomer(context, { customer_id: "CUS-1002", company_name: "NairobiOps" });
    const result = await lookupTransaction(context, { transaction_id: "TXN-9001" }); // CUS-1001's transaction
    expect(result).toEqual({ found: true, transaction_id: "TXN-9001", status: "processing", guidance: "verify caller for details" });
  });

  it("flags a review-required transaction for escalation even when verified", async () => {
    await lookupCustomer(context, { customer_id: "CUS-1003", company_name: "AccraStack" });
    const result = await lookupTransaction(context, { transaction_id: "TXN-9003" });
    expect(result).toMatchObject({ found: true, status: "review required", guidance: "escalate" });
  });
});

describe("lookup_payout", () => {
  it("never returns the recipient name, verified or not", async () => {
    await lookupCustomer(context, { customer_id: "CUS-1001", company_name: "LagosLedger" });
    const result = await lookupPayout(context, { payout_id: "PAY-7001" });
    expect(JSON.stringify(result)).not.toContain("Bright Studio");
  });

  it("finds a payout by its transaction id", async () => {
    const result = await lookupPayout(context, { transaction_id: "TXN-9001" });
    expect(result).toMatchObject({ found: true, payout_id: "PAY-7001" });
  });

  it("withholds amount for an unverified caller", async () => {
    const result = await lookupPayout(context, { payout_id: "PAY-7001" });
    expect(result).toMatchObject({ found: true, guidance: "verify caller for details" });
    expect(result).not.toHaveProperty("amount");
  });

  it("composes a support_summary from status and failure_reason (payouts has no stored column)", async () => {
    const result = await lookupPayout(context, { payout_id: "PAY-7003" });
    expect(result).toMatchObject({ found: true, support_summary: expect.stringContaining("beneficiary details need review") });
  });
});

describe("create_support_ticket", () => {
  it("creates a ticket and returns it open", async () => {
    const result = await createSupportTicket(context, { category: "payment", priority: "medium", summary: "Caller asked about a delayed payout." });
    expect(result).toMatchObject({ status: "open" });
  });

  it("is idempotent per conversation and category - a repeat returns the same ticket", async () => {
    const first = await createSupportTicket(context, { category: "payment", priority: "medium", summary: "First report." });
    const second = await createSupportTicket(context, { category: "payment", priority: "high", summary: "Same issue, mentioned again." });
    expect("ticket_id" in first && "ticket_id" in second && first.ticket_id === second.ticket_id).toBe(true);
  });

  it("allows a different category to open its own ticket in the same conversation", async () => {
    const a = await createSupportTicket(context, { category: "payment", priority: "medium", summary: "Payment issue." });
    const b = await createSupportTicket(context, { category: "dispute", priority: "medium", summary: "Separate dispute." });
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
  it("creates an escalation, a linked ticket, and a follow_up_summary", async () => {
    const result = await createEscalation(context, {
      user_name: "Test Caller",
      user_email: "caller@example.com",
      category: "dispute",
      reason: "Wants a refund investigated.",
    });
    expect(result).toMatchObject({ status: "open", follow_up_summary: expect.any(String) });
  });

  it("is idempotent per conversation - a repeat returns the existing open escalation", async () => {
    const first = await createEscalation(context, { user_name: "A", user_email: "a@example.com", category: "account", reason: "r1" });
    const second = await createEscalation(context, { user_name: "A", user_email: "a@example.com", category: "account", reason: "r2, mentioned again" });
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
    const preferredTime = "2026-10-01T10:00:00.000Z";
    const booked = await createEscalation(context, { user_name: "A", user_email: "a@example.com", category: "other", reason: "r", preferred_time: preferredTime });
    expect("follow_up_summary" in booked && booked.follow_up_summary).toContain(preferredTime);
  });

  it("refuses a preferred_time that isn't a machine-readable timestamp - callback_time is timestamptz, not free text", async () => {
    const result = await createEscalation(context, { user_name: "A", user_email: "a@example.com", category: "other", reason: "r", preferred_time: "tomorrow 10am" });
    expect(result).toEqual({ refused: true, reason: "invalid_preferred_time" });
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
