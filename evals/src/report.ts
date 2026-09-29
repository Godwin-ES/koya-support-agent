// "Prints the testing-evidence markdown table" (IMPLEMENTATION-PLAN.md
// Task 12) - the same table shape BUILD-NOTES.md's own "Testing evidence"
// section already uses.
export interface ScenarioOutcome {
  scenario: string;
  expectedBehavior: string;
  actualBehavior: string;
  passed: boolean;
  checks: Array<{ check: string; passed: boolean }>;
  notes: string | null;
  model: string;
  ttftMs: number | null;
  costUsd: number;
  conversationId: string;
}

export function toMarkdownTable(outcomes: ScenarioOutcome[]): string {
  const header = "| Scenario | Expected result | Actual result | Passed? | Notes or fix made |\n|---|---|---|---|---|";
  const rows = outcomes.map((o) => {
    const failedChecks = o.checks.filter((c) => !c.passed).map((c) => c.check);
    const notes = o.notes ?? (failedChecks.length > 0 ? `Failed: ${failedChecks.join("; ")}` : "");
    return `| ${o.scenario} | ${escape(o.expectedBehavior)} | ${escape(truncate(o.actualBehavior, 200))} | ${o.passed ? "Yes" : "No"} | ${escape(notes)} |`;
  });
  return [header, ...rows].join("\n");
}

export interface ModelComparisonRow {
  model: string;
  passRate: string;
  meanTtftMs: number | null;
  costPerConversation: number;
}

export function toComparisonTable(rows: ModelComparisonRow[]): string {
  const header = "| Model | Pass rate | Mean time to first word | Cost per conversation |\n|---|---|---|---|";
  const body = rows.map((r) => `| ${r.model} | ${r.passRate} | ${r.meanTtftMs !== null ? `${r.meanTtftMs}ms` : "—"} | $${r.costPerConversation.toFixed(4)} |`);
  return [header, ...body].join("\n");
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function escape(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
