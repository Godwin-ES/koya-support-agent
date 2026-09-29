import Link from "next/link";
import { listEvaluationRuns } from "@/lib/server/console-data";
import { EmptyState } from "@/components/primitives/async-state";

/** "Runs listed with pass rate, model, time to first word, cost and date" (SYSTEM-DESIGN.md §11.8). The runner itself is Task 12 - this reads whatever `evaluations` already holds. */
export default async function EvaluationsPage() {
  const runs = await listEvaluationRuns();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-[var(--color-text)]">Evaluations</h1>

      {runs.length === 0 ? (
        <EmptyState message="No evaluation runs yet. The evaluation runner (Task 12) writes here once it's built." />
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead className="text-left text-xs text-[var(--color-text-muted)]">
            <tr>
              <th className="border-b border-[var(--color-border)] py-2 pr-4">Run</th>
              <th className="border-b border-[var(--color-border)] py-2 pr-4">Model</th>
              <th className="border-b border-[var(--color-border)] py-2 pr-4">Pass rate</th>
              <th className="border-b border-[var(--color-border)] py-2 pr-4">Cost</th>
              <th className="border-b border-[var(--color-border)] py-2 pr-4">Date</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.run_id} className="hover:bg-[var(--color-surface-2)]">
                <td className="border-b border-[var(--color-border)] py-2 pr-4">
                  <Link href={`/console/evaluations/${encodeURIComponent(run.run_id)}`} className="text-[var(--color-accent)] hover:underline">
                    {run.run_id}
                  </Link>
                </td>
                <td className="border-b border-[var(--color-border)] py-2 pr-4">{run.model}</td>
                <td className="border-b border-[var(--color-border)] py-2 pr-4">
                  {run.pass_count}/{run.scenario_count}
                </td>
                <td className="border-b border-[var(--color-border)] py-2 pr-4">${run.cost_usd.toFixed(4)}</td>
                <td className="border-b border-[var(--color-border)] py-2 pr-4">{new Date(run.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
