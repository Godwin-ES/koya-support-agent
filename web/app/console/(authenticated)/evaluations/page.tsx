import Link from "next/link";
import { listEvaluationRuns } from "@/lib/server/console-data";
import { EmptyState } from "@/components/primitives/async-state";
import { cn } from "@/lib/utils";

/** Same info as StatusBadge's tone scale, applied to a pass-rate fraction - text plus colour together (SYSTEM-DESIGN.md §11.10), never colour alone. */
function passRateClasses(passed: number, total: number): string {
  if (total === 0) return "text-[var(--color-text-muted)]";
  const rate = passed / total;
  if (rate >= 0.8) return "text-[var(--color-success-text)]";
  if (rate >= 0.5) return "text-[var(--color-warning-text)]";
  return "text-[var(--color-danger-text)]";
}

/** "Runs listed with pass rate, model, time to first word, cost and date" (SYSTEM-DESIGN.md §11.8). The runner itself is Task 12 - this reads whatever `evaluations` already holds. */
export default async function EvaluationsPage() {
  const runs = await listEvaluationRuns();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-[var(--color-text)]">Evaluations</h1>

      {runs.length === 0 ? (
        <EmptyState message="No evaluation runs yet. The evaluation runner (Task 12) writes here once it's built." />
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)]">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-[var(--color-surface-2)] text-left text-xs font-medium tracking-wide text-[var(--color-text-muted)]">
              <tr>
                <th className="border-b border-[var(--color-border)] px-4 py-2.5">Run</th>
                <th className="border-b border-[var(--color-border)] px-4 py-2.5">Model</th>
                <th className="border-b border-[var(--color-border)] px-4 py-2.5">Pass rate</th>
                <th className="border-b border-[var(--color-border)] px-4 py-2.5">Cost</th>
                <th className="border-b border-[var(--color-border)] px-4 py-2.5">Date</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.run_id} className="[transition:background-color_var(--transition-fast)] hover:bg-[var(--color-surface-hover)]">
                  <td className="border-b border-[var(--color-border)] px-4 py-2.5">
                    <Link href={`/console/evaluations/${encodeURIComponent(run.run_id)}`} className="font-medium text-[var(--color-accent)] hover:underline">
                      {run.run_id}
                    </Link>
                  </td>
                  <td className="border-b border-[var(--color-border)] px-4 py-2.5 text-[var(--color-text-muted)]">{run.model}</td>
                  <td className={cn("border-b border-[var(--color-border)] px-4 py-2.5 font-medium", passRateClasses(run.pass_count, run.scenario_count))}>
                    {run.pass_count}/{run.scenario_count}
                  </td>
                  <td className="border-b border-[var(--color-border)] px-4 py-2.5 text-[var(--color-text-muted)]">${run.cost_usd.toFixed(4)}</td>
                  <td className="border-b border-[var(--color-border)] px-4 py-2.5 text-[var(--color-text-muted)]">{new Date(run.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
