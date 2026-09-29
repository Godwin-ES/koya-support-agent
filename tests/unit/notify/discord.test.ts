import { describe, expect, it } from "vitest";
import { agentServerDownMessage, capacityMessage, claudeFailedMessage, conversationFinishedMessage, dailyDigestMessage, evaluationRunMessage, limitReachedMessage, mcpDownMessage, newEscalationMessage, newTicketMessage, sendDiscord, spendThresholdMessage, supabaseDegradedMessage, toDiscordPayload } from "@core/notify/discord";

describe("newEscalationMessage", () => {
  it("never includes the caller's name, email or reason (SYSTEM-DESIGN.md §10: no personal data)", () => {
    const message = newEscalationMessage({ conversationId: "11111111-1111-1111-1111-111111111111", category: "dispute" });
    const payload = JSON.stringify(toDiscordPayload(message));
    expect(payload).not.toContain("@"); // no email address could have leaked in
    expect(payload.toLowerCase()).not.toContain("amara");
    expect(payload.toLowerCase()).not.toContain("reason");
  });

  it("sends no @everyone/@here-style pings", () => {
    const payload = toDiscordPayload(newEscalationMessage({ conversationId: "id", category: "account" }));
    expect(payload.allowed_mentions).toEqual({ parse: [] });
  });

  it("links to the console conversation, not a public URL with data in it", () => {
    process.env.APP_URL = "https://relaypay.example.sslip.io";
    const payload = toDiscordPayload(newEscalationMessage({ conversationId: "abc-123", category: "payment" }));
    const embed = (payload.embeds as Array<{ url?: string }>)[0];
    expect(embed.url).toBe("https://relaypay.example.sslip.io/console/conversations/abc-123");
    delete process.env.APP_URL;
  });
});

describe("failure and outage messages (Task 8)", () => {
  const messages = [
    claudeFailedMessage({ conversationId: "conv-1", kind: "temporary", detail: "Claude is overloaded (overloaded)." }),
    mcpDownMessage({ conversationId: "conv-1", detail: "ECONNREFUSED 127.0.0.1:8090" }),
    supabaseDegradedMessage({ detail: "3 writes buffered in the last 5 minutes." }),
    agentServerDownMessage(),
  ];

  it("never includes personal data - no email, no caller name, no transcript wording", () => {
    for (const message of messages) {
      const payload = JSON.stringify(toDiscordPayload(message));
      expect(payload).not.toContain("@");
      expect(payload.toLowerCase()).not.toContain("amara");
      expect(payload.toLowerCase()).not.toContain("transcript");
    }
  });

  it("sends no @everyone/@here-style pings", () => {
    for (const message of messages) {
      expect(toDiscordPayload(message).allowed_mentions).toEqual({ parse: [] });
    }
  });

  it("claudeFailedMessage's headline reflects the failure kind", () => {
    expect(claudeFailedMessage({ conversationId: "c", kind: "account", detail: "" }).title).toContain("account problem");
    expect(claudeFailedMessage({ conversationId: "c", kind: "temporary", detail: "" }).title).toContain("having trouble");
    expect(claudeFailedMessage({ conversationId: "c", kind: "bug", detail: "" }).title).toContain("call failed");
  });

  it("agentServerDownMessage links to the console, not a specific conversation (it doesn't know which one)", () => {
    expect(agentServerDownMessage().path).toBe("/console");
  });
});

describe("notification routing and content", () => {
  const finished = conversationFinishedMessage({
    conversationId: "conv-9",
    channel: "web_text",
    durationSeconds: 194,
    turns: 4,
    answerCounts: { answer: 2, clarify: 1, escalate: 1 },
    endedLabel: "Ended by the customer",
    failed: false,
    ticket: null,
    escalation: { category: "account", callbackBooked: true },
    customerId: "CUST-1001",
    costUsd: 0.0412,
  });

  const all = [
    finished,
    newEscalationMessage({ conversationId: "c", category: "account", callbackTime: "2026-10-01T09:00:00Z", customerId: "CUST-1001" }),
    newTicketMessage({ conversationId: "c", category: "payment", priority: "urgent", customerId: null }),
    capacityMessage({ pool: "voice", limit: 3 }),
    spendThresholdMessage({ spentUsd: 2.31, thresholdUsd: 2 }),
    limitReachedMessage({ kind: "chat", limit: 90 }),
    dailyDigestMessage({ day: "2026-09-29", voiceCalls: 3, chats: 5, turns: 21, escalations: 1, tickets: 2, turnedAway: 0, failedTurns: 0, claudeSpendUsd: 0.4, latestEvaluation: { passed: 13, total: 15, runId: "haiku-v3" } }),
    evaluationRunMessage({ runId: "haiku-v3", model: "claude-haiku-4-5", passed: 13, total: 15, costUsd: 0.36 }),
  ];

  it("never carries personal data or pings anyone", () => {
    for (const message of all) {
      const payload = toDiscordPayload(message);
      const text = JSON.stringify(payload);
      expect(text).not.toContain("@");
      expect(text.toLowerCase()).not.toContain("transcript");
      expect(payload.allowed_mentions).toEqual({ parse: [] });
    }
  });

  it("a finished conversation shows duration, handling, outcome and cost as fields", () => {
    const fields = (toDiscordPayload(finished).embeds as Array<{ fields: Array<{ name: string; value: string }> }>)[0]!.fields;
    const byName = Object.fromEntries(fields.map((f) => [f.name, f.value]));
    expect(finished.title).toBe("Chat finished · escalated");
    expect(byName.Duration).toBe("3m 14s");
    expect(byName.Handled).toBe("2 answered · 1 clarified · 1 escalated");
    expect(byName.Outcome).toBe("Escalation (account), callback booked");
    expect(byName["Claude cost"]).toBe("$0.04");
    expect(byName["Verified customer"]).toBe("CUST-1001");
  });

  it("an escalation says when the callback is, or that there isn't one", () => {
    const withTime = toDiscordPayload(newEscalationMessage({ conversationId: "c", category: "dispute", callbackTime: "2026-10-01T09:00:00Z" }));
    expect(JSON.stringify(withTime)).toContain("2026-10-01 09:00 UTC");
    const without = toDiscordPayload(newEscalationMessage({ conversationId: "c", category: "dispute" }));
    expect(JSON.stringify(without)).toContain("Not requested");
  });

  it("sends each channel to its own webhook, and nothing when a webhook isn't set", async () => {
    const calls: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      calls.push(url);
      return new Response(null, { status: 204 });
    }) as typeof fetch;
    process.env.DISCORD_ALERTS_WEBHOOK_URL = "https://discord.test/alerts";
    process.env.DISCORD_ACTIVITY_WEBHOOK_URL = "";
    try {
      expect(await sendDiscord("alerts", capacityMessage({ pool: "voice", limit: 3 }))).toBe(true);
      expect(await sendDiscord("activity", finished)).toBe(false);
      expect(calls).toEqual(["https://discord.test/alerts"]);
    } finally {
      globalThis.fetch = realFetch;
      process.env.DISCORD_ALERTS_WEBHOOK_URL = "";
    }
  });
});
