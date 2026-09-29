import { cn } from "@/lib/utils";

/**
 * "A small teal dot and the status word. It follows the voice level only
 * lightly, and doesn't move at all with prefers-reduced-motion. No
 * waveform animation." (SYSTEM-DESIGN.md §11.7)
 */
export function LiveIndicator({ statusWord, active, className }: { statusWord: string; active: boolean; className?: string }) {
  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <span className={cn("h-2.5 w-2.5 rounded-full bg-[var(--color-accent)]", active && "motion-safe:animate-pulse")} aria-hidden="true" />
      <span className="text-sm font-medium text-[var(--color-text)]">{statusWord}</span>
    </div>
  );
}
