import { describe, expect, it } from "vitest";
import {
  answerTypeAt,
  anyAnswerTypeIs,
  anyOf,
  escalationHasContactDetails,
  escalationRowExists,
  replyExcludes,
  replyIncludes,
  ticketNotCreatedBeforeTurn,
  ticketRowExists,
  toolCalled,
  toolNotCalled,
  type CheckContext,
} from "../../../evals/src/checks";

function ctx(overrides: Partial<CheckContext> = {}): CheckContext {
  return {
    conversationId: "conv-1",
    turns: [],
    toolCalls: [],
    retrievalFound: [],
    ticketExists: false,
    escalationExists: false,
    escalation: null,
    ticket: null,
    fullReply: "",
    ...overrides,
  };
}

describe("toolCalled / toolNotCalled", () => {
  it("passes when the named tool was called with the expected status", () => {
    const result = toolCalled("search_knowledge", "ok")(ctx({ toolCalls: [{ turn_seq: 1, tool_name: "search_knowledge", status: "ok", result_summary: null }] }));
    expect(result.passed).toBe(true);
  });

  it("fails when the tool was called but with a different status", () => {
    const result = toolCalled("search_knowledge", "ok")(ctx({ toolCalls: [{ turn_seq: 1, tool_name: "search_knowledge", status: "not_found", result_summary: null }] }));
    expect(result.passed).toBe(false);
  });

  it("toolNotCalled fails when the tool was in fact called", () => {
    const result = toolNotCalled("lookup_customer")(ctx({ toolCalls: [{ turn_seq: 1, tool_name: "lookup_customer", status: "ok", result_summary: null }] }));
    expect(result.passed).toBe(false);
  });
});

describe("anyOf", () => {
  it("passes if any of the given checks passes", () => {
    const result = anyOf("either", [toolCalled("lookup_customer", "not_found"), toolNotCalled("lookup_customer")])(ctx({ toolCalls: [] }));
    expect(result.passed).toBe(true); // toolNotCalled passes when toolCalls is empty
  });

  it("fails when none of the given checks pass", () => {
    const result = anyOf("either", [toolCalled("lookup_customer", "not_found"), toolNotCalled("lookup_customer")])(ctx({ toolCalls: [{ turn_seq: 1, tool_name: "lookup_customer", status: "ok", result_summary: null }] }));
    expect(result.passed).toBe(false);
  });
});

describe("answerTypeAt / anyAnswerTypeIs", () => {
  const turn = (answer_type: string) => ({ seq: 1, user_transcript: "", assistant_response: "", answer_type, answer_type_inferred: false, created_at: "2026-01-01T00:00:00Z", ttft_ms: null, cost_usd: null });

  it("checks the exact turn's answer_type", () => {
    expect(answerTypeAt(0, "clarify")(ctx({ turns: [turn("clarify")] })).passed).toBe(true);
    expect(answerTypeAt(0, "answer")(ctx({ turns: [turn("clarify")] })).passed).toBe(false);
  });

  it("anyAnswerTypeIs passes if any turn matches one of the given types", () => {
    expect(anyAnswerTypeIs(["escalate", "decline"])(ctx({ turns: [turn("clarify"), turn("escalate")] })).passed).toBe(true);
    expect(anyAnswerTypeIs(["escalate"])(ctx({ turns: [turn("answer")] })).passed).toBe(false);
  });
});

describe("replyIncludes / replyExcludes", () => {
  it("includes matches the accumulated reply text", () => {
    expect(replyIncludes(/vary/i, "fees varying")(ctx({ fullReply: "Fees vary by corridor." })).passed).toBe(true);
    expect(replyIncludes(/vary/i, "fees varying")(ctx({ fullReply: "Fees are fixed." })).passed).toBe(false);
  });

  it("excludes fails when the pattern is present", () => {
    expect(replyExcludes(/\$\d/, "a dollar amount")(ctx({ fullReply: "It costs $5." })).passed).toBe(false);
    expect(replyExcludes(/\$\d/, "a dollar amount")(ctx({ fullReply: "Fees vary." })).passed).toBe(true);
  });
});

describe("ticketRowExists / ticketNotCreatedBeforeTurn", () => {
  it("ticketRowExists reads the loaded flag directly", () => {
    expect(ticketRowExists()(ctx({ ticketExists: true })).passed).toBe(true);
    expect(ticketRowExists()(ctx({ ticketExists: false })).passed).toBe(false);
  });

  it("ticketNotCreatedBeforeTurn passes when the ticket's own created_at is at or after the turn's", () => {
    const turn0 = { seq: 1, user_transcript: "", assistant_response: "", answer_type: "clarify", answer_type_inferred: false, created_at: "2026-01-01T00:00:10Z", ttft_ms: null, cost_usd: null };
    const passing = ctx({ turns: [turn0], ticket: { category: "payment", created_at: "2026-01-01T00:00:20Z" } });
    expect(ticketNotCreatedBeforeTurn(0)(passing).passed).toBe(true);

    const failing = ctx({ turns: [turn0], ticket: { category: "payment", created_at: "2026-01-01T00:00:05Z" } });
    expect(ticketNotCreatedBeforeTurn(0)(failing).passed).toBe(false);
  });

  it("passes trivially when no ticket was created at all", () => {
    expect(ticketNotCreatedBeforeTurn(0)(ctx({ ticket: null })).passed).toBe(true);
  });
});

describe("escalationRowExists / escalationHasContactDetails", () => {
  it("checks the category when one is given", () => {
    const withEscalation = ctx({ escalationExists: true, escalation: { category: "compliance", user_name: "A", user_email: "a@example.com", callback_time: "2026-01-01T00:00:00Z", reason: "r" } });
    expect(escalationRowExists("compliance")(withEscalation).passed).toBe(true);
    expect(escalationRowExists("payment")(withEscalation).passed).toBe(false);
  });

  it("escalationHasContactDetails requires name, email and a callback time", () => {
    const complete = ctx({ escalation: { category: "other", user_name: "A", user_email: "a@example.com", callback_time: "2026-01-01T00:00:00Z", reason: "r" } });
    expect(escalationHasContactDetails()(complete).passed).toBe(true);

    const missingCallback = ctx({ escalation: { category: "other", user_name: "A", user_email: "a@example.com", callback_time: null, reason: "r" } });
    expect(escalationHasContactDetails()(missingCallback).passed).toBe(false);
  });
});
