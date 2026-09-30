import { describe, expect, it } from "vitest";
import { DecisionTagExtractor, stripDecisionTags } from "@core/agent/decision-tag";

function run(chunks: string[]) {
  const x = new DecisionTagExtractor();
  const out = chunks.map((c) => x.push(c)).join("") + x.flush();
  return { out, decision: x.decision };
}

describe("DecisionTagExtractor", () => {
  it("removes the tag and reads the decision, even split across chunks", () => {
    expect(run(["Fees vary by corridor.", " <deci", 'sion type="answer" confidence="0.9"/>'])).toEqual({ out: "Fees vary by corridor. ", decision: { answer_type: "answer", confidence: 0.9 } });
  });

  it("passes ordinary text straight through - including a '<' that isn't a tag", () => {
    expect(run(["Amounts < $500 clear same day.", " Anything else?"])).toEqual({ out: "Amounts < $500 clear same day. Anything else?", decision: null });
  });

  it("drops an unfinished tag at the end instead of speaking it", () => {
    expect(run(["Sure, one moment. <decision type="])).toEqual({ out: "Sure, one moment. ", decision: null });
  });

  it("ignores a tag with an invalid type", () => {
    expect(run(['Okay. <decision type="maybe"/>']).decision).toBeNull();
  });

  it("stripDecisionTags cleans the recorded reply", () => {
    expect(stripDecisionTags('It usually takes 2-5 business days. <decision type="decline" confidence="0.8"/>')).toBe("It usually takes 2-5 business days.");
  });
});
