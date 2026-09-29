import { CalendarClock, Clock, CloudOff, MicOff, PhoneMissed, Users, type LucideIcon } from "lucide-react";
import type { CallState } from "@core/domain/call-actions";
import type { CallLimitStatus } from "@/lib/use-usage-limits";
import { cn } from "@/lib/utils";

export function formatMmSs(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type Tone = "info" | "warning" | "danger";

const NOTICES: Partial<Record<CallState, { icon: LucideIcon; tone: Tone; title: string }>> = {
  mic_blocked: { icon: MicOff, tone: "warning", title: "Microphone blocked" },
  limit_reached: { icon: CalendarClock, tone: "warning", title: "Daily limit reached" },
  busy: { icon: Users, tone: "info", title: "All agents busy" },
  unavailable: { icon: CloudOff, tone: "danger", title: "Support unavailable" },
  dropped: { icon: PhoneMissed, tone: "warning", title: "Call dropped" },
};

const TONE_CLASSES: Record<Tone, string> = {
  info: "border-[var(--color-info-text)]/15 bg-[var(--color-info-bg)] text-[var(--color-info-text)]",
  warning: "border-[var(--color-warning-text)]/15 bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]",
  danger: "border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger-text)]",
};

export function hasNotice(state: CallState): boolean {
  return state in NOTICES;
}

/** One card per problem state, carrying deriveCallActions' own status line - the one place that wording appears. */
export function CallNotice({ callState, statusLine, className }: { callState: CallState; statusLine: string; className?: string }) {
  const notice = NOTICES[callState];
  if (!notice) return null;
  const Icon = notice.icon;
  return (
    <div role="status" className={cn("flex w-full animate-message-in items-start gap-3 rounded-[var(--radius-xl)] border p-4 text-left", TONE_CLASSES[notice.tone], className)}>
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/70">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold">{notice.title}</p>
        <p className="mt-0.5 text-sm text-[var(--color-text)]">{statusLine}</p>
      </div>
    </div>
  );
}

const HEADLINES: Partial<Record<CallState, string>> = {
  listening: "Go ahead, we're listening.",
  agent_speaking: "RelayPay is answering.",
  requesting: "Setting up a secure line.",
  connecting: "Setting up a secure line.",
  ending: "Wrapping up your call.",
};

/** The status word, large, with a one-line gloss - for the in-call states only; problem states use CallNotice instead. */
export function CallHeadline({ callState, statusLine, className }: { callState: CallState; statusLine: string; className?: string }) {
  const gloss = HEADLINES[callState];
  if (!gloss) return null;
  const live = callState === "listening" || callState === "agent_speaking";
  return (
    <div className={cn("min-w-0", className)}>
      <p className="flex items-center gap-2 text-lg font-semibold text-[var(--color-text)] lg:justify-center">
        {live && (
          <span className="relative flex size-2.5" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--color-accent)] opacity-60 motion-safe:animate-ping" />
            <span className="relative inline-flex size-2.5 rounded-full bg-[var(--color-accent)]" />
          </span>
        )}
        {statusLine}
      </p>
      <p className="mt-0.5 text-sm text-[var(--color-text-muted)]">{gloss}</p>
    </div>
  );
}

export function TimerPill({ remainingSeconds }: { remainingSeconds: number }) {
  const low = remainingSeconds < 60;
  return (
    <p
      aria-live="off"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium tabular-nums [transition:background-color_var(--transition-fast),color_var(--transition-fast)]",
        low ? "border-[var(--color-warning-text)]/20 bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]" : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-muted)]",
      )}
    >
      <Clock className="size-3.5" aria-hidden="true" />
      <span>{formatMmSs(remainingSeconds)} remaining</span>
    </p>
  );
}

export function CallLimitMeter({ status, className }: { status: CallLimitStatus; className?: string }) {
  const remaining = Math.max(0, status.limit - status.used);
  return (
    <div className={cn("inline-flex items-center gap-2.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs text-[var(--color-text-muted)] shadow-[var(--shadow-sm)]", className)}>
      <span className="flex gap-1" aria-hidden="true">
        {Array.from({ length: status.limit }, (_, i) => (
          <span key={i} className={cn("h-1.5 w-4 rounded-full", i < remaining ? "bg-[var(--color-accent)]" : "bg-[var(--color-surface-3)]")} />
        ))}
      </span>
      <span>
        <span className="font-semibold text-[var(--color-text)]">{remaining}</span> of {status.limit} calls left today
      </span>
    </div>
  );
}
