import { CircleCheck, CircleDashed, Clock, MessageSquareOff, TicketCheck, TriangleAlert, UserRoundCheck, type LucideIcon } from "lucide-react";
import type { ConversationOutcome } from "@/lib/server/console-data";
import { cn } from "@/lib/utils";

const OUTCOMES: Record<ConversationOutcome, { label: string; icon: LucideIcon; tone: string }> = {
  in_progress: { label: "In progress", icon: Clock, tone: "bg-[var(--color-info-bg)] text-[var(--color-info-text)]" },
  escalated: { label: "Escalated", icon: UserRoundCheck, tone: "bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]" },
  ticket: { label: "Ticket opened", icon: TicketCheck, tone: "bg-[var(--color-info-bg)] text-[var(--color-info-text)]" },
  resolved: { label: "Resolved", icon: CircleCheck, tone: "bg-[var(--color-success-bg)] text-[var(--color-success-text)]" },
  abandoned: { label: "Left mid-chat", icon: CircleDashed, tone: "bg-[var(--color-surface-2)] text-[var(--color-text-muted)]" },
  error: { label: "Failed", icon: TriangleAlert, tone: "bg-[var(--color-danger-bg)] text-[var(--color-danger-text)]" },
  no_messages: { label: "Nothing said", icon: MessageSquareOff, tone: "bg-[var(--color-surface-2)] text-[var(--color-text-muted)]" },
};

/** How a conversation ended - always an icon and words, never colour alone (SYSTEM-DESIGN.md §11.10). */
export function OutcomePill({ outcome, className }: { outcome: ConversationOutcome; className?: string }) {
  const { label, icon: Icon, tone } = OUTCOMES[outcome];
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-black/5", tone, className)}>
      <Icon className="size-3" aria-hidden="true" />
      {label}
    </span>
  );
}

export function channelLabel(channel: string): string {
  return channel === "web_text" ? "Chat" : channel === "phone" ? "Phone" : "Voice call";
}
