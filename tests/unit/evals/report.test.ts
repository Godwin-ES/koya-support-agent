import { describe, expect, it } from "vitest";
import { toComparisonTable, toMarkdownTable, type ScenarioOutcome } from "../../../evals/src/report";

const outcome: ScenarioOutcome = {
  scenario: "knowledge-answer-fees",
  expectedBehavior: "Explains fees vary.",
  actualBehavior: "Fees vary by corridor and currency.",
  passed: true,
  checks: [{ check: "reply mentions fees varying", passed: true }],
  notes: null,
  model: "claude-haiku-4-5",
  ttftMs: 850,
  costUsd: 0.012,
  conversationId: "conv-1",
};

describe("toMarkdownTable", () => {
  it("renders a row per scenario with the expected columns", () => {
    const table = toMarkdownTable([outcome]);
    expect(table).toContain("| Scenario | Expected result | Actual result | Passed? | Notes or fix made |");
    expect(table).toContain("knowledge-answer-fees");
    expect(table).toContain("Yes");
  });

  it("lists failed checks in the notes column when a scenario fails and no note was given", () => {
    const failing: ScenarioOutcome = { ...outcome, passed: false, checks: [{ check: "reply mentions fees varying", passed: false }] };
    const table = toMarkdownTable([failing]);
    expect(table).toContain("Failed: reply mentions fees varying");
    expect(table).toMatch(/\|\s*No\s*\|/);
  });

  it("escapes pipe characters so a reply can't break the table", () => {
    const withPipe: ScenarioOutcome = { ...outcome, actualBehavior: "Fees are $5 | $10 depending on route." };
    const table = toMarkdownTable([withPipe]);
    expect(table).toContain("\\|");
  });
});

describe("toComparisonTable", () => {
  it("renders the Haiku-vs-Sonnet comparison row shape", () => {
    const table = toComparisonTable([
      { model: "claude-haiku-4-5", passRate: "13/15", meanTtftMs: 900, costPerConversation: 0.02 },
      { model: "claude-sonnet-5", passRate: "14/15", meanTtftMs: 1100, costPerConversation: 0.06 },
    ]);
    expect(table).toContain("claude-haiku-4-5");
    expect(table).toContain("13/15");
    expect(table).toContain("$0.0200");
  });
});
