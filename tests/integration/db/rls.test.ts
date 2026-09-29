import { afterEach, describe, expect, it } from "vitest";
import { anonClient, serviceRoleClient } from "../helpers/db";

// IMPLEMENTATION-PLAN.md Task 3: "the anon role can read nothing; the
// service role can write." SYSTEM-DESIGN.md §7: nothing here is
// browser-readable at all - migration 006 enables RLS with zero policies
// for anon/authenticated, and grants nothing to them in the first place.
const TABLES = [
  "customers",
  "transactions",
  "payouts",
  "conversations",
  "conversation_turns",
  "conversation_events",
  "retrieval_logs",
  "tool_calls",
  "support_tickets",
  "escalations",
  "evaluations",
  "call_limits",
  "knowledge_chunks",
] as const;

describe("row level security", () => {
  const anon = anonClient();
  const service = serviceRoleClient();
  const createdConversationIds: string[] = [];

  afterEach(async () => {
    if (createdConversationIds.length === 0) return;
    await service.from("conversations").delete().in("id", createdConversationIds.splice(0));
  });

  it.each(TABLES)("anon can't read %s - denied before RLS even runs, not just an empty result", async (table) => {
    const { data, error } = await anon.from(table).select();
    // Confirms the *grant* is missing (42501), not merely that RLS filtered every row -
    // an empty `data: []` with no error would mean anon has SELECT but no policy matched,
    // which is a different (and here, wrong) configuration.
    expect(error).not.toBeNull();
    expect(error!.code).toBe("42501");
    expect(data).toBeNull();
  });

  it("anon can't write to conversations either", async () => {
    const { error } = await anon.from("conversations").insert({ channel: "web_text" });
    expect(error).not.toBeNull();
  });

  it("service role can read and write - the agent-server's own access", async () => {
    const { data: inserted, error: insertError } = await service.from("conversations").insert({ channel: "web_text" }).select().single();
    if (insertError) throw insertError;
    createdConversationIds.push(inserted.id);

    const { data: read, error: readError } = await service.from("conversations").select().eq("id", inserted.id).single();
    if (readError) throw readError;
    expect(read.channel).toBe("web_text");
  });

  it("service role can read the seed tables too", async () => {
    const { data, error } = await service.from("customers").select().limit(1);
    if (error) throw error;
    expect(Array.isArray(data)).toBe(true);
  });
});
