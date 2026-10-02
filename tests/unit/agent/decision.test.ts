import { describe, expect, it } from "vitest";
import { decideTurn } from "@core/agent/decision";
import type { AnswerType } from "@core/agent/decision";
import { buildSystemPrompt } from "@core/agent/system-prompt";

describe("decideTurn", () => {
  it("uses the agent's own declared decision when present, marking it not inferred", () => {
    const result = decideTurn({ toolCalls: [], declared: { answer_type: "answer", confidence: 0.9, knowledge_chunk_ids: ["abc"] } });
    expect(result).toEqual({ answer_type: "answer", confidence: 0.9, confidence_note: null, inferred: false, knowledge_chunk_ids: ["abc"] });
  });

  it("falls back to inference when the declared answer_type isn't one of the four valid values - a real live Haiku run declared 'general_info'", () => {
    const result = decideTurn({ toolCalls: [{ name: "search_knowledge", status: "ok" }], declared: { answer_type: "general_info" as AnswerType, confidence: 0.85 } });
    expect(result.inferred).toBe(true);
    expect(result.answer_type).toBe("answer"); // falls through to the same inference a non-declaration would get
    expect(result.confidence_note).toContain("general_info");
    expect(result.confidence).toBeNull(); // the invalid declaration's own confidence is discarded, not trusted
  });

  it("infers escalate when create_escalation succeeded, even without a declaration", () => {
    const result = decideTurn({ toolCalls: [{ name: "create_escalation", status: "ok" }] });
    expect(result.answer_type).toBe("escalate");
    expect(result.inferred).toBe(true);
  });

  it("a refused escalation attempt does not count as escalate", () => {
    const result = decideTurn({ toolCalls: [{ name: "create_escalation", status: "refused" }] });
    expect(result.answer_type).not.toBe("escalate");
  });

  it("infers answer when search_knowledge found something", () => {
    const result = decideTurn({ toolCalls: [{ name: "search_knowledge", status: "ok" }] });
    expect(result.answer_type).toBe("answer");
  });

  it("infers answer when a lookup tool succeeded (a lookup summary is an answer from an approved source too)", () => {
    for (const name of ["lookup_customer", "lookup_transaction", "lookup_payout"]) {
      expect(decideTurn({ toolCalls: [{ name, status: "ok" }] }).answer_type).toBe("answer");
    }
  });

  it("a lookup that found nothing falls to the clarify default, not decline - decline is for 'no approved information at all'", () => {
    const result = decideTurn({ toolCalls: [{ name: "lookup_transaction", status: "not_found" }] });
    expect(result.answer_type).toBe("clarify");
  });

  it("infers decline when search_knowledge came back empty", () => {
    const result = decideTurn({ toolCalls: [{ name: "search_knowledge", status: "not_found" }] });
    expect(result.answer_type).toBe("decline");
  });

  it("escalation outranks a knowledge search in the same turn", () => {
    const result = decideTurn({
      toolCalls: [
        { name: "search_knowledge", status: "not_found" },
        { name: "create_escalation", status: "ok" },
      ],
    });
    expect(result.answer_type).toBe("escalate");
  });

  it("falls back to clarify when no tool gives any signal", () => {
    const result = decideTurn({ toolCalls: [] });
    expect(result.answer_type).toBe("clarify");
    expect(result.confidence).toBeNull();
    expect(result.confidence_note).toContain("inferred");
  });
});

describe("support action instructions", () => {
  it("requires a later explicit confirmation with complete callback details", () => {
    const prompt = buildSystemPrompt(new Date("2026-10-02T12:00:00+01:00"));
    expect(prompt).toContain("Monday through Friday from 9 AM to 3 PM West Africa Time");
    expect(prompt).toContain("If AM/PM is missing, always ask which they mean");
    expect(prompt).toContain("confirmation_key");
    expect(prompt).toContain("exactly the same details");
    expect(prompt).toContain("Do not use holding phrases or filler");
    expect(prompt).not.toContain("don't ask them to confirm the time first");
  });
});
