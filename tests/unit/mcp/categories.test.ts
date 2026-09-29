import { describe, expect, it } from "vitest";
import { isCategory, isPriority } from "@core/mcp/tools/categories";

describe("isCategory", () => {
  it("accepts escalation-rules.md's five categories", () => {
    for (const c of ["compliance", "account", "dispute", "payment", "other"]) expect(isCategory(c)).toBe(true);
  });

  it("rejects anything else, including a near-miss like KYC's own vocabulary", () => {
    expect(isCategory("kyc")).toBe(false);
    expect(isCategory("")).toBe(false);
    expect(isCategory("Compliance")).toBe(false); // case-sensitive - the model is expected to use the documented lowercase values
  });
});

describe("isPriority", () => {
  it("accepts migration 003's four priorities", () => {
    for (const p of ["low", "medium", "high", "urgent"]) expect(isPriority(p)).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isPriority("critical")).toBe(false);
  });
});
