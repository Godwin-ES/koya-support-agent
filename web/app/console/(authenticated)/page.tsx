import Link from "next/link";
import { MessageSquare, AlertTriangle, ClipboardCheck } from "lucide-react";
import { getOverview } from "@/lib/server/console-data";

const CARD_CLASSES = "rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-sm)]";
const LINKED_CARD_CLASSES = "block [transition:box-shadow_var(--transition-fast),transform_var(--transition-fast)] hover:-translate-y-px hover:shadow-[var(--shadow-md)]";

/** "Overview: today's conversations, open escalations, the latest evaluation result, service health" (SYSTEM-DESIGN.md §11.1). */
export default async function OverviewPage() {
  const overview = await getOverview();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold text-[var(--color-text)]">Overview</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className={CARD_CLASSES}>
          <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            <p className="text-xs">Today&apos;s conversations</p>
          </div>
          <p className="mt-2 text-3xl font-semibold text-[var(--color-text)]">{overview.todaysConversationCount}</p>
        </div>
        <Link href="/console/queue" className={`${CARD_CLASSES} ${LINKED_CARD_CLASSES}`}>
          <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <p className="text-xs">Open escalations</p>
          </div>
          <p className="mt-2 text-3xl font-semibold text-[var(--color-text)]">{overview.openEscalationCount}</p>
        </Link>
        {overview.latestEvaluationRunId ? (
          <Link href={`/console/evaluations/${encodeURIComponent(overview.latestEvaluationRunId)}`} className={`${CARD_CLASSES} ${LINKED_CARD_CLASSES}`}>
            <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
              <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
              <p className="text-xs">Latest evaluation</p>
            </div>
            <p className="mt-2 truncate text-sm font-medium text-[var(--color-text)]">{overview.latestEvaluationRunId}</p>
          </Link>
        ) : (
          <div className={CARD_CLASSES}>
            <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
              <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
              <p className="text-xs">Latest evaluation</p>
            </div>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">No evaluation runs yet. Run one from the Evaluations page.</p>
          </div>
        )}
      </div>
    </div>
  );
}
