import { cn } from "@/lib/utils";

/**
 * "A small teal dot and the status word. It follows the voice level only
 * lightly, and doesn't move at all with prefers-reduced-motion. No
 * waveform animation." (SYSTEM-DESIGN.md §11.7)
 */
export function LiveIndicator({ statusWord, active, className }: { statusWord: string; active: boolean; className?: string }) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 shadow-[var(--shadow-sm)]",
        "[transition:box-shadow_var(--transition-fast)]",
        active && "border-[var(--color-accent)]/30",
        className,
      )}
    >
      <span className={cn("h-2.5 w-2.5 rounded-full bg-[var(--color-accent)]", active && "motion-safe:animate-pulse")} aria-hidden="true" />
      <span className="text-sm font-medium text-[var(--color-text)]">{statusWord}</span>
    </div>
  );
}
