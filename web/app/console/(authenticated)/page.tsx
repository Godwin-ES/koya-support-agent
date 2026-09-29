import { getOverview } from "@/lib/server/console-data";

/** "Overview: today's conversations, open escalations, the latest evaluation result, service health" (SYSTEM-DESIGN.md §11.1). */
export default async function OverviewPage() {
  const overview = await getOverview();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold text-[var(--color-text)]">Overview</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <p className="text-xs text-[var(--color-text-muted)]">Today&apos;s conversations</p>
          <p className="mt-1 text-2xl font-semibold text-[var(--color-text)]">{overview.todaysConversationCount}</p>
        </div>
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <p className="text-xs text-[var(--color-text-muted)]">Open escalations</p>
          <p className="mt-1 text-2xl font-semibold text-[var(--color-text)]">{overview.openEscalationCount}</p>
        </div>
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <p className="text-xs text-[var(--color-text-muted)]">Latest evaluation</p>
          <p className="mt-1 text-sm font-medium text-[var(--color-text)]">{overview.latestEvaluationRunId ? overview.latestEvaluationRunId : "No evaluation runs yet. Run one from the Evaluations page."}</p>
        </div>
      </div>
    </div>
  );
}
