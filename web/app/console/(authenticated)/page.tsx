import Link from "next/link";
import { MessageSquare, AlertTriangle, ClipboardCheck, PhoneCall } from "lucide-react";
import { formatDateTime, formatTime } from "@core/domain/format-time";
import { getOverview, listCallbacksDue } from "@/lib/server/console-data";

const CARD_CLASSES = "rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-sm)]";
const LINKED_CARD_CLASSES = "block [transition:box-shadow_var(--transition-fast),transform_var(--transition-fast)] hover:-translate-y-px hover:shadow-[var(--shadow-md)]";

/** "Overview: today's conversations, open escalations, the latest evaluation result, service health" (SYSTEM-DESIGN.md §11.1). */
export default async function OverviewPage() {
  const [overview, callbacks] = await Promise.all([getOverview(), listCallbacksDue()]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold text-[var(--color-text)]">Overview</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className={CARD_CLASSES}>
          <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            <p className="text-xs">Customer conversations today</p>
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

      <section aria-labelledby="callbacks-heading" className={CARD_CLASSES}>
        <div className="flex items-center gap-2">
          <PhoneCall className="h-4 w-4 text-[var(--color-accent)]" aria-hidden="true" />
          <h2 id="callbacks-heading" className="text-sm font-semibold text-[var(--color-text)]">
            Callbacks due today
          </h2>
          <span className="text-xs text-[var(--color-text-muted)]">· times in WAT</span>
        </div>
        {callbacks.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--color-text-muted)]">No callbacks booked for today.</p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--color-border)]">
            {callbacks.map((c) => (
              <li key={c.escalationId}>
                <Link href={`/console/queue?case=${c.escalationId}`} className="flex items-center gap-4 py-2.5 [transition:background-color_var(--transition-fast)] hover:bg-[var(--color-surface-hover)]">
                  <span className={`w-28 shrink-0 text-sm font-semibold ${c.overdue ? "text-[var(--color-danger-text)]" : "text-[var(--color-text)]"}`}>{c.overdue ? formatDateTime(c.callbackTime).replace(" WAT", "") : formatTime(c.callbackTime).replace(" WAT", "")}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-[var(--color-text)]">{c.person?.name ?? "Unknown customer"}</span>
                    <span className="block truncate text-xs capitalize text-[var(--color-text-muted)]">
                      {c.category} escalation{c.person?.detail ? ` · ${c.person.detail}` : ""}
                    </span>
                  </span>
                  {c.overdue && <span className="shrink-0 rounded-full bg-[var(--color-danger-bg)] px-2 py-0.5 text-xs font-medium text-[var(--color-danger-text)]">Overdue</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
