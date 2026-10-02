import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { partitionHistoryItems } from "@/components/history/history-parts";
import { HistoryTabs, parseHistoryView } from "@/components/history/history-tabs";
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

describe("HistoryTabs", () => {
  it("uses Calls as the default view and links Chats to its own history view", () => {
    render(<HistoryTabs current="calls" />);

    expect(screen.getByRole("link", { name: "Calls" })).toHaveAttribute("href", "/history");
    expect(screen.getByRole("link", { name: "Calls" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Chats" })).toHaveAttribute("href", "/history?view=chats");
    expect(screen.getByRole("link", { name: "Chats" })).not.toHaveAttribute("aria-current");
  });

  it("accepts only the chats query value and defaults everything else to calls", () => {
    expect(parseHistoryView("chats")).toBe("chats");
    expect(parseHistoryView("calls")).toBe("calls");
    expect(parseHistoryView("unexpected")).toBe("calls");
    expect(parseHistoryView(undefined)).toBe("calls");
  });
});
