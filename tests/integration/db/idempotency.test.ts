import { afterEach, describe, expect, it } from "vitest";
import { serviceRoleClient } from "../helpers/db";

// SYSTEM-DESIGN.md §5: "one open ticket per conversation and category",
// "one open escalation per conversation" - enforced as partial unique
// indexes (migration 003), not just app-level checks.
describe("ticket and escalation idempotency (database-enforced)", () => {
  const supabase = serviceRoleClient();
  const conversationIds: string[] = [];

  afterEach(async () => {
    if (conversationIds.length === 0) return;
    await supabase.from("conversations").delete().in("id", conversationIds.splice(0));
  });

  async function newConversation(): Promise<string> {
    const { data, error } = await supabase.from("conversations").insert({ channel: "web_text" }).select().single();
    if (error) throw error;
    conversationIds.push(data.id);
    return data.id;
  }

  it("refuses a second open ticket for the same conversation and category", async () => {
    const conversationId = await newConversation();
    const first = await supabase.from("support_tickets").insert({ conversation_id: conversationId, category: "payment", summary: "Invoice payment failed" });
    expect(first.error).toBeNull();

    const second = await supabase.from("support_tickets").insert({ conversation_id: conversationId, category: "payment", summary: "Same issue, asked again" });
    expect(second.error).not.toBeNull();
    expect(second.error!.code).toBe("23505"); // unique_violation
  });

  it("allows a new ticket once the first is closed", async () => {
    const conversationId = await newConversation();
    const { data: first, error: firstError } = await supabase
      .from("support_tickets")
      .insert({ conversation_id: conversationId, category: "payment", summary: "First issue" })
      .select()
      .single();
    if (firstError) throw firstError;

    await supabase.from("support_tickets").update({ status: "closed" }).eq("id", first.id);

    const second = await supabase.from("support_tickets").insert({ conversation_id: conversationId, category: "payment", summary: "A later, separate issue" });
    expect(second.error).toBeNull();
  });

  it("allows the same conversation to have open tickets in different categories", async () => {
    const conversationId = await newConversation();
    const a = await supabase.from("support_tickets").insert({ conversation_id: conversationId, category: "payment", summary: "Payment issue" });
    const b = await supabase.from("support_tickets").insert({ conversation_id: conversationId, category: "invoicing", summary: "Invoicing issue" });
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
  });

  it("refuses a second open escalation for the same conversation", async () => {
    const conversationId = await newConversation();
    const first = await supabase.from("escalations").insert({ conversation_id: conversationId, category: "account", reason: "Account restricted" });
    expect(first.error).toBeNull();

    const second = await supabase.from("escalations").insert({ conversation_id: conversationId, category: "compliance", reason: "A different reason, same conversation" });
    expect(second.error).not.toBeNull();
    expect(second.error!.code).toBe("23505");
  });

  it("rejects an escalation category outside the escalation-rules.md list", async () => {
    const conversationId = await newConversation();
    const result = await supabase.from("escalations").insert({ conversation_id: conversationId, category: "billing", reason: "Not one of the five allowed categories" });
    expect(result.error).not.toBeNull();
    expect(result.error!.code).toBe("23514"); // check_violation
  });
});
