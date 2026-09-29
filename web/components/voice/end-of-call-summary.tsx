import type { EndOfCallSummary as EndOfCallSummaryData } from "@/lib/use-voice-call";

/**
 * SYSTEM-DESIGN.md §11.7: "If a ticket or escalation was created: its
 * reference number and what happens next... If none was: 'Thanks for
 * calling. If you need more help, start a new call.'"
 */
export function EndOfCallSummary({ summary }: { summary: EndOfCallSummaryData }) {
  return (
    <div role="status" className="max-w-md rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-center text-sm text-[var(--color-text)] shadow-[var(--shadow-sm)]">
      {summary.endedDueToSilence && <p className="mb-2 font-medium">Ended after 30 seconds of silence.</p>}
      {summary.followUpSummary ?? "Thanks for calling. If you need more help, start a new call."}
    </div>
  );
}
