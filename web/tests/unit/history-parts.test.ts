import { describe, expect, it } from "vitest";
import { partitionHistoryItems } from "@/components/history/history-parts";
import type { HistoryItem } from "@/lib/server/history";

function item(id: string, channel: HistoryItem["channel"]): HistoryItem {
  return { id, channel, startedAt: "2026-10-02T20:00:00Z", durationSeconds: 60, opener: id, turns: 1, outcome: null, inProgress: false };
}

describe("partitionHistoryItems", () => {
  it("separates the signed-in user's voice and phone calls from chats while preserving newest-first order", () => {
    const result = partitionHistoryItems([
      item("chat-new", "web_text"),
      item("call-web", "web_voice"),
      item("call-phone", "phone"),
      item("chat-old", "web_text"),
    ]);

    expect(result.calls.map(({ id }) => id)).toEqual(["call-web", "call-phone"]);
    expect(result.chats.map(({ id }) => id)).toEqual(["chat-new", "chat-old"]);
  });
});
