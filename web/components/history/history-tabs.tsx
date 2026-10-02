import Link from "next/link";
import { MessageSquareText, Phone } from "lucide-react";
import { cn } from "@/lib/utils";

export type HistoryView = "calls" | "chats";

const TABS: Array<{ view: HistoryView; label: string; icon: typeof Phone }> = [
  { view: "calls", label: "Calls", icon: Phone },
  { view: "chats", label: "Chats", icon: MessageSquareText },
];

export function parseHistoryView(value: string | undefined): HistoryView {
  return value === "chats" ? "chats" : "calls";
}

export function HistoryTabs({ current }: { current: HistoryView }) {
  return (
    <nav aria-label="Conversation type" className="inline-flex rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-[var(--shadow-sm)]">
      {TABS.map(({ view, label, icon: Icon }) => (
        <Link
          key={view}
          href={view === "calls" ? "/history" : "/history?view=chats"}
          aria-current={current === view ? "page" : undefined}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-[var(--radius-md)] px-3 py-1.5 text-sm font-medium [transition:background-color_var(--transition-fast),color_var(--transition-fast)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]",
            current === view ? "bg-[var(--color-accent-soft)] text-[var(--color-accent-hover)]" : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]",
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
