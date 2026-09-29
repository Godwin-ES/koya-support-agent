import { CircleCheck, Clock, MessageSquareText, Phone, TicketCheck, UserRoundCheck } from "lucide-react";
import type { HistoryItem, HistoryOutcome } from "@/lib/server/history";
import { formatMmSs } from "@/components/voice/call-status";
import { cn } from "@/lib/utils";

export function ChannelIcon({ channel, className }: { channel: HistoryItem["channel"]; className?: string }) {
  const Icon = channel === "web_text" ? MessageSquareText : Phone;
  return (
    <span aria-hidden="true" className={cn("grid size-10 shrink-0 place-items-center rounded-[var(--radius-lg)]", channel === "web_text" ? "bg-[var(--color-primary-soft)] text-[var(--color-primary)]" : "bg-[var(--color-accent-soft)] text-[var(--color-accent)]", className)}>
      <Icon className="size-[18px]" />
    </span>
  );
}

export function channelLabel(channel: HistoryItem["channel"]): string {
  return channel === "web_text" ? "Chat" : channel === "phone" ? "Phone call" : "Voice call";
}

export function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" });
}

export function OutcomeBadge({ outcome, inProgress }: { outcome: HistoryOutcome | null; inProgress: boolean }) {
  if (inProgress) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-info-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-info-text)]">
        <Clock className="size-3" aria-hidden="true" />
        In progress
      </span>
    );
  }
  if (!outcome) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-success-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-success-text)]">
        <CircleCheck className="size-3" aria-hidden="true" />
        Resolved
      </span>
    );
  }
  const Icon = outcome.kind === "escalation" ? UserRoundCheck : TicketCheck;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-warning-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-warning-text)]">
      <Icon className="size-3" aria-hidden="true" />
      {outcome.kind === "escalation" ? "Specialist follow-up" : "Ticket"} · <span className="font-mono">{outcome.reference}</span>
    </span>
  );
}

export function durationLabel(seconds: number | null): string | null {
  return seconds === null ? null : formatMmSs(seconds);
}
