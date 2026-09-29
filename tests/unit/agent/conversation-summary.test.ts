import { describe, expect, it } from "vitest";
import { buildConversationSummary, endedLabel } from "@core/agent/conversation-summary";

describe("buildConversationSummary", () => {
  it("describes the channel, opener, how each turn was handled, the outcome and how it ended", () => {
    const summary = buildConversationSummary({
      channel: "web_text",
      turns: [
        { user_transcript: "How long does an international transfer take?", answer_type: "answer" },
        { user_transcript: "My payment is stuck", answer_type: "clarify" },
        { user_transcript: "It's TXN-9001", answer_type: "answer" },
      ],
      ticket: { category: "payment", priority: "high" },
      escalation: null,
      customerCompany: "LagosLedger",
      endedLabel: "Ended by the customer",
    });
    expect(summary).toBe(
      'Web chat, 3 turns. Opened with: "How long does an international transfer take?" Handled: 2 answered, 1 clarifying question. Verified as LagosLedger. Ticket opened (payment, high priority). Ended by the customer.',
    );
  });

  it("names the escalation instead of its linked ticket, and a booked callback", () => {
    const summary = buildConversationSummary({
      channel: "web_voice",
      turns: [{ user_transcript: "My account was restricted", answer_type: "escalate" }],
      ticket: { category: "account", priority: "high" },
      escalation: { category: "account", callbackBooked: true },
      customerCompany: null,
      endedLabel: "Caller hung up",
    });
    expect(summary).toContain("Voice call, 1 turn.");
    expect(summary).toContain("Escalated to a specialist (account) with a callback booked.");
    expect(summary).not.toContain("Ticket opened");
  });

  it("handles a conversation where nothing was said", () => {
    expect(buildConversationSummary({ channel: "web_voice", turns: [], ticket: null, escalation: null, customerCompany: null, endedLabel: "Caller hung up" })).toBe("Voice call with no messages. Caller hung up.");
  });

  it("shortens a long opening message", () => {
    const summary = buildConversationSummary({ channel: "web_text", turns: [{ user_transcript: "a".repeat(400), answer_type: "answer" }], ticket: null, escalation: null, customerCompany: null, endedLabel: "Ended" });
    expect(summary).toContain("…");
    expect(summary.length).toBeLessThan(260);
  });
});

describe("endedLabel", () => {
  it.each([
    ["caller_ended", "Ended by the customer"],
    ["inactive", "Closed after 15 minutes without a new message"],
    ["exceeded-max-duration", "Reached the 5-minute call limit"],
    ["customer-ended-call", "Caller hung up"],
    ["pipeline-error-openai-llm-failed", "Ended by an error (pipeline-error-openai-llm-failed)"],
    [null, "Ended"],
  ])("%s -> %s", (reason, label) => {
    expect(endedLabel(reason)).toBe(label);
  });
});
