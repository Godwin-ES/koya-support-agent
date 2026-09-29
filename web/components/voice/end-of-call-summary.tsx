import type { EndOfCallSummary as EndOfCallSummaryData } from "@/lib/use-voice-call";

/**
 * SYSTEM-DESIGN.md §11.7: "If a ticket or escalation was created: its
 * reference number and what happens next... If none was: 'Thanks for
 * calling. If you need more help, start a new call.'"
 */
export function EndOfCallSummary({ summary }: { summary: EndOfCallSummaryData }) {
  return (
    <div role="status" className="max-w-md rounded-[var(--radius-md)] bg-[var(--color-surface-2)] p-4 text-center text-sm text-[var(--color-text)]">
      {summary.followUpSummary ?? "Thanks for calling. If you need more help, start a new call."}
    </div>
  );
}
