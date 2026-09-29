import * as Icons from "lucide-react";
import type { StatusEntry, StatusTone } from "@core/domain/status";
import { cn } from "@/lib/utils";

const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: "bg-[var(--color-surface-2)] text-[var(--color-text-muted)]",
  info: "bg-[var(--color-info-bg)] text-[var(--color-info-text)]",
  warning: "bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]",
  success: "bg-[var(--color-success-bg)] text-[var(--color-success-text)]",
  danger: "bg-[var(--color-danger-bg)] text-[var(--color-danger-text)]",
};

/**
 * Reads only from the registries in packages/core/src/domain/status.ts
 * (SYSTEM-DESIGN.md §11.2: "no component may hardcode a status label or
 * colour"). Icon and text together, never colour alone.
 */
export function StatusBadge({ entry, className }: { entry: StatusEntry; className?: string }) {
  const Icon = (Icons as unknown as Record<string, Icons.LucideIcon>)[entry.icon];

  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ring-black/5", TONE_CLASSES[entry.tone], className)}>
      {Icon && <Icon className={cn("h-3.5 w-3.5", entry.icon === "Loader2" && "animate-spin motion-reduce:animate-none")} aria-hidden="true" />}
      {entry.label}
    </span>
  );
}
