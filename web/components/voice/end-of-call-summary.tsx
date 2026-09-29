import { CircleCheck, TimerOff } from "lucide-react";
import type { EndOfCallSummary as EndOfCallSummaryData } from "@/lib/use-voice-call";
import { cn } from "@/lib/utils";
import { formatMmSs } from "./call-status";

/**
 * SYSTEM-DESIGN.md §11.7: "If a ticket or escalation was created: its
 * reference number and what happens next... If none was: 'Thanks for
 * calling. If you need more help, start a new call.'"
 */
export function EndOfCallSummary({ summary, className }: { summary: EndOfCallSummaryData; className?: string }) {
  return (
    <div role="status" className={cn("w-full animate-message-in rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-left shadow-[var(--shadow-md)]", className)}>
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--color-success-bg)] text-[var(--color-success-text)]">
          <CircleCheck className="size-5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-base font-semibold text-[var(--color-text)]">Call ended</p>
          {summary.durationSeconds != null && <p className="text-xs text-[var(--color-text-muted)]">Lasted {formatMmSs(summary.durationSeconds)}</p>}
        </div>
      </div>
      {summary.endedDueToSilence && (
        <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[var(--color-warning-bg)] px-2.5 py-1 text-xs font-medium text-[var(--color-warning-text)]">
          <TimerOff className="size-3.5" aria-hidden="true" />
          Ended after 30 seconds of silence.
        </p>
      )}
      <div className="mt-4 border-t border-[var(--color-border)] pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">{summary.followUpSummary ? "What happens next" : "Summary"}</p>
        <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-text)]">{summary.followUpSummary ?? "Thanks for calling. If you need more help, start a new call."}</p>
      </div>
    </div>
  );
}
