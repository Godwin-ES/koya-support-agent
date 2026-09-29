"use client";

import { useState } from "react";
import { Headset, Keyboard, Mic, Phone, PhoneOff } from "lucide-react";
import { deriveCallActions, type CallState } from "@core/domain/call-actions";
import { useVoiceCall } from "@/lib/use-voice-call";
import { useCallLimit } from "@/lib/use-call-limit";
import { ActionButton } from "@/components/primitives/action-button";
import { cn } from "@/lib/utils";
import { AgentAvatar, initialsFrom } from "@/components/conversation/avatars";
import { MessageThread } from "@/components/conversation/message-thread";
import { TopicGrid } from "@/components/conversation/topics";
import { AppHeader } from "@/components/voice/app-header";
import { CallOrb } from "@/components/voice/call-orb";
import { CallHeadline, CallLimitMeter, CallNotice, TimerPill } from "@/components/voice/call-status";
import { EndOfCallSummary } from "@/components/voice/end-of-call-summary";
import { PrivacyNote } from "@/components/voice/privacy-note";
import { TextFallback } from "@/components/voice/text-fallback";

const IN_CALL: CallState[] = ["requesting", "connecting", "listening", "agent_speaking", "ending"];

export interface VoicePageClientProps {
  accessToken: string;
  onSignOut: () => Promise<void>;
  userName?: string | null;
  userEmail?: string | null;
}

/** The voice page (SYSTEM-DESIGN.md §11.7) - the one screen customers see, once signed in. */
export function VoicePageClient({ accessToken, onSignOut, userName = null, userEmail = null }: VoicePageClientProps) {
  const { callState, fullTranscript, partial = null, endOfCallSummary, remainingSeconds, startCall, endCall, subscribeToVolume } = useVoiceCall(accessToken);
  const [textMode, setTextMode] = useState(false);
  const [textDraft, setTextDraft] = useState<string | undefined>(undefined);
  const [hasStartedBefore, setHasStartedBefore] = useState(false);
  const callLimit = useCallLimit(accessToken, callState);

  const actions = deriveCallActions(callState);
  const isActive = callState === "listening" || callState === "agent_speaking";
  const inCall = IN_CALL.includes(callState);
  const firstName = userName?.trim().split(/\s+/)[0] ?? null;
  const initials = initialsFrom(userName, userEmail);
  const hasConversation = fullTranscript.length > 0 || partial !== null || isActive || callState === "ending";

  function handleStart() {
    setHasStartedBefore(true);
    return startCall();
  }

  function openText(draft?: string) {
    setTextDraft(draft);
    setTextMode(true);
  }

  const typeInsteadButton = (className?: string) => (
    <ActionButton action={async () => openText()} idleLabel="Type instead" state={actions.typeInstead} variant="secondary" icon={<Keyboard className="size-4" aria-hidden="true" />} className={cn("rounded-full bg-[var(--color-surface)] px-4 hover:bg-[var(--color-surface-2)]", className)} />
  );

  return (
    <div className="bg-dot-grid flex min-h-dvh flex-col">
      <AppHeader displayName={userName ?? userEmail} initials={initials} onSignOut={onSignOut} showSignOut={!inCall} />

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6 sm:px-6 sm:py-10">
        <h1 className="sr-only">RelayPay Support</h1>

        {textMode ? (
          <TextFallback accessToken={accessToken} onSwitchToVoice={() => setTextMode(false)} initialDraft={textDraft} userInitials={initials} firstName={firstName} />
        ) : hasConversation ? (
          <div className="grid flex-1 animate-fade-in items-start gap-5 lg:grid-cols-[340px_minmax(0,1fr)] lg:gap-6">
            <aside aria-label="Call controls" className="flex flex-col gap-5 rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-md)] lg:sticky lg:top-24 lg:items-center lg:p-7 lg:text-center">
              <div className={cn("items-center gap-4 lg:flex lg:flex-col lg:gap-5", inCall ? "flex" : "hidden")}>
                <CallOrb callState={callState} variant="workspace" subscribeToVolume={subscribeToVolume} />
                <div className="flex min-w-0 flex-1 flex-col gap-2 lg:items-center">
                  <CallHeadline callState={callState} statusLine={actions.statusLine} />
                  {isActive && remainingSeconds !== null && <TimerPill remainingSeconds={remainingSeconds} />}
                </div>
              </div>

              <CallNotice callState={callState} statusLine={actions.statusLine} />
              {callState === "ended" && endOfCallSummary && <EndOfCallSummary summary={endOfCallSummary} className="shadow-none" />}

              <div className={cn("flex gap-2 lg:w-full lg:flex-col", !inCall && "flex-col sm:flex-row")}>
                <ActionButton action={handleStart} idleLabel="Start call" pendingLabel="Connecting…" state={actions.startCall} variant="primary" icon={<Phone className="size-4" aria-hidden="true" />} data-testid="start-call" className="flex-1 rounded-full py-2.5 lg:w-full" />
                <ActionButton action={async () => endCall()} idleLabel="End call" pendingLabel="Ending…" state={actions.endCall} variant="danger" icon={<PhoneOff className="size-4" aria-hidden="true" />} data-testid="end-call" className="flex-1 rounded-full py-2.5 lg:w-full" />
                {typeInsteadButton("flex-1 py-2.5 lg:w-full")}
              </div>

              {!inCall && callLimit && <CallLimitMeter status={callLimit} className="self-start lg:self-center" />}
            </aside>

            <section aria-label="Conversation" className="flex h-[calc(100dvh-21rem)] min-h-[340px] flex-col lg:h-[min(680px,calc(100dvh-13rem))] lg:min-h-[420px] overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-md)]">
              <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <AgentAvatar />
                  <div>
                    <h2 className="text-sm font-semibold text-[var(--color-text)]">RelayPay Support</h2>
                    <p className="text-xs text-[var(--color-text-muted)]">{isActive ? "Live transcript" : "Call transcript"}</p>
                  </div>
                </div>
                {isActive && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-accent-soft)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-accent-hover)]">
                    <span className="size-1.5 rounded-full bg-[var(--color-accent)] motion-safe:animate-pulse" aria-hidden="true" />
                    Live
                  </span>
                )}
              </div>
              <MessageThread
                messages={fullTranscript}
                live={partial}
                agentTyping={isActive && fullTranscript[fullTranscript.length - 1]?.role === "user" && partial?.role !== "user"}
                userInitials={initials}
                label="Call transcript"
                className="bg-[var(--color-bg)]"
                emptyState={
                  <div className="flex h-full flex-col items-center justify-center py-10 text-center">
                    <span className="grid size-12 place-items-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
                      <Mic className="size-5" aria-hidden="true" />
                    </span>
                    <p className="mt-4 text-sm font-semibold text-[var(--color-text)]">Say hello to get started</p>
                    <p className="mt-1 max-w-xs text-sm text-[var(--color-text-muted)]">Your conversation appears here, word by word, as you talk.</p>
                  </div>
                }
              />
            </section>
          </div>
        ) : (
          <section className="mx-auto flex w-full max-w-2xl animate-fade-in flex-col items-center text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-medium text-[var(--color-text-muted)] shadow-[var(--shadow-sm)]">
              <Headset className="size-3.5 text-[var(--color-accent)]" aria-hidden="true" />
              Voice and chat support
            </span>
            <h2 className="mt-5 text-balance text-3xl font-semibold tracking-tight text-[var(--color-primary)] sm:text-4xl">{firstName ? `Hi ${firstName}, how can we help?` : "How can we help today?"}</h2>
            <p className="mt-3 max-w-md text-balance text-base text-[var(--color-text-muted)]">Ask about payments, payouts, invoices or your account. Talk to us, or type if you prefer.</p>

            <div className="mt-8">
              <CallOrb callState={callState} variant="hero" startCall={actions.startCall} onStart={handleStart} subscribeToVolume={subscribeToVolume} />
            </div>

            <div className="mt-4 flex w-full max-w-md flex-col items-center gap-4">
              {(callState === "requesting" || callState === "connecting") && <p className="text-sm text-[var(--color-text-muted)]">Setting up a secure line.</p>}
              <ActionButton action={async () => endCall()} idleLabel="End call" pendingLabel="Ending…" state={actions.endCall} variant="danger" icon={<PhoneOff className="size-4" aria-hidden="true" />} data-testid="end-call" className="rounded-full px-5" />
              <CallNotice callState={callState} statusLine={actions.statusLine} />
              {callState === "ended" && endOfCallSummary && <EndOfCallSummary summary={endOfCallSummary} />}
              {!hasStartedBefore && callState === "idle" && <p className="max-w-xs text-xs text-[var(--color-text-muted)]">Your browser will ask for microphone access when you start a call.</p>}
              {!inCall && callLimit && <CallLimitMeter status={callLimit} />}
            </div>

            <div className="mt-6 flex items-center gap-3 text-sm text-[var(--color-text-muted)]">
              <span className="h-px w-10 bg-[var(--color-border)]" aria-hidden="true" />
              or
              <span className="h-px w-10 bg-[var(--color-border)]" aria-hidden="true" />
            </div>
            <div className="mt-4">{typeInsteadButton()}</div>

            {!inCall && (
              <div className="mt-14 w-full text-left">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Popular topics</h3>
                <TopicGrid onPick={openText} disabled={actions.typeInstead.kind !== "enabled"} />
              </div>
            )}
          </section>
        )}
      </main>

      <footer className="border-t border-[var(--color-border)] bg-[var(--color-surface)]/70">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
          <PrivacyNote />
        </div>
      </footer>
    </div>
  );
}
