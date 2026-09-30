// @vitest-environment node
//
// The console shows customer conversations by default and evaluation runs
// (no account) on their own tab - for the list, the queue and the overview.
import { afterAll, describe, expect, it } from "vitest";
import { serviceRoleClient } from "../helpers/db";
import { listCases, listConversations } from "../../../web/lib/server/console-data";

const supabase = serviceRoleClient();
const ids: string[] = [];

async function conversation(callerRef: string | null): Promise<string> {
  const { data, error } = await supabase.from("conversations").insert({ channel: "web_text", caller_ref: callerRef }).select("id").single();
  if (error) throw error;
  ids.push(data.id as string);
  await supabase.from("support_tickets").insert({ conversation_id: data.id, category: "payment", priority: "low", summary: "source filter test" });
  return data.id as string;
}

afterAll(async () => {
  for (const id of ids) await supabase.from("conversations").delete().eq("id", id);
});

describe("console source filter", () => {
  it("separates customer conversations and their cases from evaluation runs", async () => {
    const customer = await conversation(`source-test-${crypto.randomUUID()}`);
    const evaluation = await conversation(null);

    const customers = (await listConversations()).map((c) => c.id);
    const evaluations = (await listConversations({ source: "evaluations" })).map((c) => c.id);
    expect(customers).toContain(customer);
    expect(customers).not.toContain(evaluation);
    expect(evaluations).toContain(evaluation);
    expect(evaluations).not.toContain(customer);

    const customerCases = (await listCases()).map((c) => c.conversation_id);
    const evaluationCases = (await listCases({ source: "evaluations" })).map((c) => c.conversation_id);
    expect(customerCases).toContain(customer);
    expect(customerCases).not.toContain(evaluation);
    expect(evaluationCases).toContain(evaluation);
  });
});
