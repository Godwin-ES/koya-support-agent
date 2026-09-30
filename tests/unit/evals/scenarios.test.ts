import { describe, expect, it } from "vitest";
import { ALL_SCENARIOS, PRD_SCENARIOS, VARIANT_SCENARIOS } from "../../../evals/src/scenarios";

describe("evaluation scenarios", () => {
  it("has the 9 PRD scenarios and 7 variants (SYSTEM-DESIGN.md §8)", () => {
    expect(PRD_SCENARIOS).toHaveLength(9);
    expect(VARIANT_SCENARIOS).toHaveLength(7);
    expect(ALL_SCENARIOS).toHaveLength(16);
  });

  it("every scenario has a unique key", () => {
    const keys = ALL_SCENARIOS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every scenario has at least one turn and at least one check", () => {
    for (const scenario of ALL_SCENARIOS) {
      expect(scenario.turns.length, `${scenario.key} has no turns`).toBeGreaterThan(0);
      expect(scenario.checks.length, `${scenario.key} has no checks`).toBeGreaterThan(0);
      expect(scenario.expectedBehavior.length, `${scenario.key} has no expected behaviour`).toBeGreaterThan(0);
    }
  });
});
