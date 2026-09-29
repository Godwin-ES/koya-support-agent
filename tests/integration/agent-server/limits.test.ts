// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkVisitorDailyLimit, countVisitorConversationsToday } from "@core/agent/limits";
import { serviceRoleClient } from "../helpers/db";

const supabase: SupabaseClient = serviceRoleClient();
const conversationIds: string[] = [];

afterEach(async () => {
  for (const id of conversationIds.splice(0)) await supabase.from("conversations").delete().eq("id", id);
});

async function newConversationFor(callerRef: string, startedAt?: string): Promise<void> {
  const { data, error } = await supabase
    .from("conversations")
    .insert({ channel: "web_voice", caller_ref: callerRef, ...(startedAt ? { started_at: startedAt } : {}) })
    .select("id")
    .single();
  if (error) throw error;
  conversationIds.push(data.id as string);
}

describe("checkVisitorDailyLimit", () => {
  it("allows a visitor with no calls today", async () => {
    const result = await checkVisitorDailyLimit(supabase, `test-visitor-${crypto.randomUUID()}`);
    expect(result).toEqual({ allowed: true });
  });

  it("allows a visitor under the 3-call limit", async () => {
    const callerRef = `test-visitor-${crypto.randomUUID()}`;
    await newConversationFor(callerRef);
    await newConversationFor(callerRef);
    expect(await checkVisitorDailyLimit(supabase, callerRef)).toEqual({ allowed: true });
  });

  it("refuses a visitor who already has 3 calls today", async () => {
    const callerRef = `test-visitor-${crypto.randomUUID()}`;
    await newConversationFor(callerRef);
    await newConversationFor(callerRef);
    await newConversationFor(callerRef);
    expect(await checkVisitorDailyLimit(supabase, callerRef)).toEqual({ allowed: false, reason: "daily_limit_reached" });
  });

  it("does not count yesterday's calls against today's limit", async () => {
    const callerRef = `test-visitor-${crypto.randomUUID()}`;
    const yesterday = new Date(Date.now() - 25 * 60 * 60_000).toISOString();
    await newConversationFor(callerRef, yesterday);
    await newConversationFor(callerRef, yesterday);
    await newConversationFor(callerRef, yesterday);
    expect(await checkVisitorDailyLimit(supabase, callerRef)).toEqual({ allowed: true });
  });

  it("does not count another visitor's calls", async () => {
    const callerRefA = `test-visitor-${crypto.randomUUID()}`;
    const callerRefB = `test-visitor-${crypto.randomUUID()}`;
    await newConversationFor(callerRefA);
    await newConversationFor(callerRefA);
    await newConversationFor(callerRefA);
    expect(await checkVisitorDailyLimit(supabase, callerRefB)).toEqual({ allowed: true });
  });
});

describe("countVisitorConversationsToday", () => {
  it("counts today's calls for this visitor only", async () => {
    const callerRef = `test-visitor-${crypto.randomUUID()}`;
    await newConversationFor(callerRef);
    await newConversationFor(callerRef);
    expect(await countVisitorConversationsToday(supabase, callerRef)).toBe(2);
  });

  it("returns 0 for a visitor with no calls today", async () => {
    expect(await countVisitorConversationsToday(supabase, `test-visitor-${crypto.randomUUID()}`)).toBe(0);
  });
});
