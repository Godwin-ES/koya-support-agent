// @vitest-environment node
//
// Ending conversations against the real database: one end per
// conversation however many end signals arrive, a summary and total cost
// written, and the sweep closing the chats and calls that never send one.
import { afterEach, describe, expect, it } from "vitest";
import { finalizeConversation, sweepStaleConversations } from "../../../agent-server/src/lifecycle";
import { claimOnce } from "../../../agent-server/src/ops";
import { serviceRoleClient } from "../helpers/db";

const supabase = serviceRoleClient();
const conversationIds: string[] = [];
const alertKeys: string[] = [];

afterEach(async () => {
  for (const id of conversationIds.splice(0)) await supabase.from("conversations").delete().eq("id", id);
  for (const key of alertKeys.splice(0)) await supabase.from("ops_alerts").delete().eq("key", key);
});

async function newConversation(fields: Record<string, unknown>): Promise<string> {
  const { data, error } = await supabase.from("conversations").insert(fields).select("id").single();
  if (error) throw error;
  conversationIds.push(data.id as string);
  return data.id as string;
}

async function addTurn(conversationId: string, seq: number, answerType: string, cost: number, createdAt?: string) {
  const { error } = await supabase.from("conversation_turns").insert({
    conversation_id: conversationId,
    seq,
    user_transcript: seq === 1 ? "How long does an international transfer take?" : "Thanks",
    assistant_response: "Usually one business day.",
    answer_type: answerType,
    cost_usd: cost,
    ...(createdAt ? { created_at: createdAt } : {}),
  });
  if (error) throw error;
}

describe("finalizeConversation", () => {
  it("ends the conversation once, with a built summary and the summed turn cost", async () => {
    const id = await newConversation({ channel: "web_text", caller_ref: null });
    await addTurn(id, 1, "answer", 0.012);
    await addTurn(id, 2, "clarify", 0.008);

    expect(await finalizeConversation(supabase, id, { endedReason: "caller_ended", finalStatus: "completed" })).toBe(true);
    expect(await finalizeConversation(supabase, id, { endedReason: "caller_ended", finalStatus: "completed" })).toBe(false);

    const { data } = await supabase.from("conversations").select("ended_at, ended_reason, final_status, summary, cost_usd").eq("id", id).single();
    expect(data!.ended_at).not.toBeNull();
    expect(data!.ended_reason).toBe("caller_ended");
    expect(data!.final_status).toBe("completed");
    expect(Number(data!.cost_usd)).toBeCloseTo(0.02, 4);
    expect(data!.summary).toBe('Web chat, 2 turns. Opened with: "How long does an international transfer take?" Handled: 1 answered, 1 clarifying question. Ended by the customer.');
  });

  it("prefers Vapi's own summary when the end-of-call report carries one", async () => {
    const id = await newConversation({ channel: "web_voice", caller_ref: null });
    await finalizeConversation(supabase, id, { endedReason: "customer-ended-call", finalStatus: "completed", vapiSummary: "The caller asked about fees." });
    const { data } = await supabase.from("conversations").select("summary").eq("id", id).single();
    expect(data!.summary).toBe("The caller asked about fees.");
  });
});

describe("sweepStaleConversations", () => {
  const now = new Date();
  const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();

  it("closes a chat with no message for 15 minutes as abandoned, and leaves an active one open", async () => {
    const stale = await newConversation({ channel: "web_text", started_at: minutesAgo(40) });
    await addTurn(stale, 1, "answer", 0, minutesAgo(20));
    const active = await newConversation({ channel: "web_text", started_at: minutesAgo(40) });
    await addTurn(active, 1, "answer", 0, minutesAgo(3));

    const closed = await sweepStaleConversations(supabase, now);
    expect(closed).toContain(stale);
    expect(closed).not.toContain(active);

    const { data } = await supabase.from("conversations").select("id, final_status, ended_reason").in("id", [stale, active]);
    const byId = Object.fromEntries((data ?? []).map((r) => [r.id, r]));
    expect(byId[stale]).toMatchObject({ final_status: "abandoned", ended_reason: "inactive" });
    expect(byId[active]!.final_status).toBeNull();
  });

  it("closes a voice call still open 30 minutes after it started, but not a recent one", async () => {
    const stuck = await newConversation({ channel: "web_voice", started_at: minutesAgo(45) });
    const recent = await newConversation({ channel: "web_voice", started_at: minutesAgo(20) });
    const closed = await sweepStaleConversations(supabase, now);
    expect(closed).toContain(stuck);
    expect(closed).not.toContain(recent);
  });
});

describe("claimOnce", () => {
  it("is true the first time a key is claimed and false after that", async () => {
    const key = `test:${crypto.randomUUID()}`;
    alertKeys.push(key);
    expect(await claimOnce(supabase, key)).toBe(true);
    expect(await claimOnce(supabase, key)).toBe(false);
  });
});
