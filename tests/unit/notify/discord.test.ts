import { describe, expect, it } from "vitest";
import { agentServerDownMessage, claudeFailedMessage, mcpDownMessage, newEscalationMessage, supabaseDegradedMessage, toDiscordPayload } from "@core/notify/discord";

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
