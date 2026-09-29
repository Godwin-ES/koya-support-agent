import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { ActionButton } from "./action-button";

/**
 * The five async states (SYSTEM-DESIGN.md §11.3). "Success" is just the
 * page's own content - no wrapper needed for it, so only the other four
 * get a component here.
 */

/** Shaped like the final content, no layout shift - never a centred spinner over an empty page. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-[var(--radius-md)] bg-[var(--color-surface-2)] motion-reduce:animate-none", className)} aria-hidden="true" />;
}

export interface EmptyStateProps {
  message: string;
  action?: { label: string; onClick: () => void };
}

/** "Says what would be here and offers the next action" - never a bare "No data". */
export function EmptyState({ message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] px-6 py-12 text-center">
      <Inbox className="h-5 w-5 text-[var(--color-text-muted)]" aria-hidden="true" />
      <p className="max-w-sm text-sm text-[var(--color-text-muted)]">{message}</p>
      {action && (
        <button type="button" onClick={action.onClick} className="text-sm font-medium text-[var(--color-accent)] [transition:opacity_var(--transition-fast)] hover:opacity-80 hover:underline">
          {action.label}
        </button>
      )}
    </div>
  );
}

export interface ErrorStateProps {
  message: string;
  onRetry: () => void | Promise<void>;
}

/** What failed, why, and what to do next - with Retry. */
export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-6 py-8 text-center shadow-[var(--shadow-sm)]">
      <AlertTriangle className="h-5 w-5 text-[var(--color-danger-text)]" aria-hidden="true" />
      <p className="max-w-sm text-sm text-[var(--color-danger-text)]">{message}</p>
      <ActionButton action={onRetry} idleLabel="Retry" variant="secondary" />
    </div>
  );
}

export interface DegradedStateProps {
  reason: string;
  className?: string;
}

/** An `inferred` decision, a tool that returned "not enough to verify", an interrupted turn, a failed check - shown as a first-class state with its reason, never hidden or styled as a crash. */
export function DegradedState({ reason, className }: DegradedStateProps) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--color-warning-bg)] px-2 py-1 text-xs text-[var(--color-warning-text)]", className)}>
      <RefreshCw className="h-3 w-3" aria-hidden="true" />
      {reason}
    </span>
  );
}
