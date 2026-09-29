import { describe, expect, it } from "vitest";
import { issueConversationToken, verifyConversationToken } from "@core/agent/conversation-token";

const SECRET = "test-secret-at-least-32-bytes-long-1234";

describe("conversation token", () => {
  it("verifies a token issued for the same conversation", () => {
    const token = issueConversationToken(SECRET, "conv-1");
    expect(verifyConversationToken(SECRET, token, "conv-1")).toBe(true);
  });

  it("rejects a token checked against a different conversation id", () => {
    const token = issueConversationToken(SECRET, "conv-1");
    expect(verifyConversationToken(SECRET, token, "conv-2")).toBe(false);
  });

  it("rejects a token signed with a different secret", () => {
    const token = issueConversationToken(SECRET, "conv-1");
    expect(verifyConversationToken("a-completely-different-secret-value", token, "conv-1")).toBe(false);
  });

  it("rejects a tampered token", () => {
    const token = issueConversationToken(SECRET, "conv-1");
    const tampered = token.slice(0, -1) + (token.at(-1) === "a" ? "b" : "a");
    expect(verifyConversationToken(SECRET, tampered, "conv-1")).toBe(false);
  });

  it("rejects an expired token", () => {
    const issuedAt = Date.parse("2026-01-01T00:00:00.000Z");
    const token = issueConversationToken(SECRET, "conv-1", issuedAt);
    const wayLater = issuedAt + 60 * 60_000; // 1 hour later, past the 20-minute TTL
    expect(verifyConversationToken(SECRET, token, "conv-1", wayLater)).toBe(false);
  });

  it("accepts a token just before expiry and rejects it just after", () => {
    const issuedAt = Date.parse("2026-01-01T00:00:00.000Z");
    const token = issueConversationToken(SECRET, "conv-1", issuedAt);
    expect(verifyConversationToken(SECRET, token, "conv-1", issuedAt + 19 * 60_000)).toBe(true);
    expect(verifyConversationToken(SECRET, token, "conv-1", issuedAt + 21 * 60_000)).toBe(false);
  });

  it("rejects a malformed token", () => {
    expect(verifyConversationToken(SECRET, "not-a-real-token", "conv-1")).toBe(false);
    expect(verifyConversationToken(SECRET, "", "conv-1")).toBe(false);
  });
});
