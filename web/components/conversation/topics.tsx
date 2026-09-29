import { ArrowLeftRight, FileText, ShieldCheck, Wallet, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Topic {
  icon: LucideIcon;
  title: string;
  prompt: string;
}

export const TOPICS: Topic[] = [
  { icon: ArrowLeftRight, title: "Payments & transfers", prompt: "How long does an international transfer take?" },
  { icon: Wallet, title: "Payouts", prompt: "When will my payout arrive?" },
  { icon: FileText, title: "Invoices", prompt: "How do I send an invoice to a client?" },
  { icon: ShieldCheck, title: "Account & security", prompt: "How do I verify my account?" },
];

/** Starter questions - picking one opens the text chat with it ready to send, never sent automatically. */
export function TopicGrid({ onPick, disabled, compact, className }: { onPick: (prompt: string) => void; disabled?: boolean; compact?: boolean; className?: string }) {
  return (
    <ul className={cn("grid w-full grid-cols-1 gap-3 sm:grid-cols-2", className)}>
      {TOPICS.map(({ icon: Icon, title, prompt }) => (
        <li key={title}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onPick(prompt)}
            className={cn(
              "group flex w-full items-start gap-3 rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] text-left shadow-[var(--shadow-sm)]",
              "[transition-property:border-color,box-shadow,transform] [transition-duration:var(--transition-fast)]",
              "hover:-translate-y-0.5 hover:border-[var(--color-accent)]/40 hover:shadow-[var(--shadow-md)]",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]",
              "disabled:pointer-events-none disabled:opacity-50",
              compact ? "p-3" : "p-4",
            )}
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-md)] bg-[var(--color-accent-soft)] text-[var(--color-accent)] [transition:background-color_var(--transition-fast),color_var(--transition-fast)] group-hover:bg-[var(--color-accent)] group-hover:text-white">
              <Icon className="size-[18px]" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-[var(--color-text)]">{title}</span>
              <span className="mt-0.5 block text-[13px] leading-snug text-[var(--color-text-muted)]">{prompt}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
