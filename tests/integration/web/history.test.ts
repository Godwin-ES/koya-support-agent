// @vitest-environment node
//
// The customer's read-only history (web/lib/server/history.ts), against the
// real database: an account sees its own conversations and never another's.
import { afterAll, describe, expect, it } from "vitest";
import { serviceRoleClient } from "../helpers/db";

import { getHistoryDetail, listHistory } from "../../../web/lib/server/history";

const supabase = serviceRoleClient();
const ids: string[] = [];
const accountA = `history-test-${crypto.randomUUID()}`;
const accountB = `history-test-${crypto.randomUUID()}`;

async function conversationFor(callerRef: string, opener: string): Promise<string> {
  const { data, error } = await supabase.from("conversations").insert({ channel: "web_text", caller_ref: callerRef, ended_at: new Date().toISOString() }).select("id").single();
  if (error) throw error;
  ids.push(data.id as string);
  await supabase.from("conversation_turns").insert({ conversation_id: data.id, seq: 1, user_transcript: opener, assistant_response: "Here's what I found.", answer_type: "answer" });
  return data.id as string;
}

afterAll(async () => {
  for (const id of ids) await supabase.from("conversations").delete().eq("id", id);
});

describe("history", () => {
  it("lists only the account's own conversations, and opens only its own", async () => {
    const own = await conversationFor(accountA, "How long does a transfer take?");
    const theirs = await conversationFor(accountB, "Check my payout");

    const list = await listHistory(accountA);
    expect(list.map((i) => i.id)).toEqual([own]);
    expect(list[0]).toMatchObject({ opener: "How long does a transfer take?", turns: 1, outcome: null, inProgress: false });

    expect(await getHistoryDetail(accountA, theirs)).toBeNull();
    expect((await getHistoryDetail(accountA, own))?.messages).toEqual([
      { role: "user", text: "How long does a transfer take?" },
      { role: "assistant", text: "Here's what I found." },
    ]);
    expect(await getHistoryDetail(accountA, "not-a-uuid")).toBeNull();
  });
});
