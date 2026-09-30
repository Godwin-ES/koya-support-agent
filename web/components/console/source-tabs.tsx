import Link from "next/link";
import { FlaskConical, Users } from "lucide-react";
import type { ConversationSource } from "@/lib/server/console-data";
import { cn } from "@/lib/utils";

const TABS: Array<{ source: ConversationSource; label: string; icon: typeof Users }> = [
  { source: "customers", label: "Customers", icon: Users },
  { source: "evaluations", label: "Evaluation runs", icon: FlaskConical },
];

/** Customer conversations (the default) or evaluation-run traffic - kept apart so scripted runs don't bury real ones. */
export function SourceTabs({ basePath, current }: { basePath: string; current: ConversationSource }) {
  return (
    <nav aria-label="Source" className="inline-flex rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-[var(--shadow-sm)]">
      {TABS.map(({ source, label, icon: Icon }) => (
        <Link
          key={source}
          href={source === "customers" ? basePath : `${basePath}?source=evaluations`}
          aria-current={current === source ? "page" : undefined}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-[var(--radius-md)] px-3 py-1.5 text-sm font-medium [transition:background-color_var(--transition-fast),color_var(--transition-fast)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]",
            current === source ? "bg-[var(--color-accent-soft)] text-[var(--color-accent-hover)]" : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]",
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
