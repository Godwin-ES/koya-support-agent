import { LoaderCircle } from "lucide-react";
import type { SupportActivity } from "@core/domain/call-actions";

export function SupportActionStatus({ activity }: { activity: Exclude<SupportActivity, null> }) {
  return (
    <div role="status" aria-live="polite" className="flex w-full items-center gap-2.5 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5 text-left text-sm text-[var(--color-text)]">
      <LoaderCircle className="size-4 shrink-0 animate-spin text-[var(--color-accent)]" aria-hidden="true" />
      <span className="font-medium">{activity.label}</span>
    </div>
  );
}
