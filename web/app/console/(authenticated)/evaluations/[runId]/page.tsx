import { notFound } from "next/navigation";
import Link from "next/link";
import { EVALUATION_RESULT } from "@core/domain/status";
import { getEvaluationRun } from "@/lib/server/console-data";
import { StatusBadge } from "@/components/primitives/status-badge";

/** "A run shows each scenario's checks as pass or fail, with the actual reply and a link to its conversation" (SYSTEM-DESIGN.md §11.8). */
export default async function EvaluationRunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const scenarios = await getEvaluationRun(decodeURIComponent(runId));
  if (scenarios.length === 0) notFound();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-[var(--color-text)]">Run {decodeURIComponent(runId)}</h1>
      <ul className="flex flex-col gap-4">
        {scenarios.map((scenario) => (
          <li key={scenario.id} className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">{scenario.scenario}</h2>
              <StatusBadge entry={scenario.passed === null ? { label: "Not checked", icon: "HelpCircle", tone: "neutral" } : scenario.passed ? EVALUATION_RESULT.pass : EVALUATION_RESULT.fail} />
            </div>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">Expected: {scenario.expected_behavior}</p>
            {scenario.actual_behavior && <p className="mt-1 text-sm">{scenario.actual_behavior}</p>}
            {scenario.checks.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1">
                {scenario.checks.map((check, i) => (
                  <li key={i} className="flex items-center gap-1.5">
                    <StatusBadge entry={check.passed ? EVALUATION_RESULT.pass : EVALUATION_RESULT.fail} />
                    <span className="text-xs text-[var(--color-text)]">{check.check}</span>
                  </li>
                ))}
              </ul>
            )}
            {scenario.notes && <p className="mt-2 text-xs text-[var(--color-text-muted)]">{scenario.notes}</p>}
            <div className="mt-2 flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
              {scenario.ttft_ms !== null && <span>{scenario.ttft_ms}ms to first word</span>}
              <span>${scenario.cost_usd.toFixed(4)}</span>
              {scenario.conversation_id && (
                <Link href={`/console/conversations/${scenario.conversation_id}`} className="text-[var(--color-accent)] hover:underline">
                  View conversation →
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
