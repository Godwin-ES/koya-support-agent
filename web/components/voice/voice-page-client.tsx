"use client";

import { useState } from "react";
import { deriveCallActions } from "@core/domain/call-actions";
import { useVoiceCall } from "@/lib/use-voice-call";
import { useCallLimit } from "@/lib/use-call-limit";
import { Wordmark } from "@/components/brand/wordmark";
import { ActionButton } from "@/components/primitives/action-button";
import { LiveIndicator } from "@/components/voice/live-indicator";
import { Captions } from "@/components/voice/captions";
import { PrivacyNote } from "@/components/voice/privacy-note";
import { EndOfCallSummary } from "@/components/voice/end-of-call-summary";
import { TextFallback } from "@/components/voice/text-fallback";

function formatMmSs(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** The voice page (SYSTEM-DESIGN.md §11.7) - the one screen customers see, once signed in (web/app/page.tsx's server wrapper confirms the session and hands down the access token every request to agent-server now needs). */
export function VoicePageClient({ accessToken, onSignOut }: { accessToken: string; onSignOut: () => Promise<void> }) {
  const { callState, callerText, agentText, fullTranscript, endOfCallSummary, remainingSeconds, startCall, endCall } = useVoiceCall(accessToken);
  const [textMode, setTextMode] = useState(false);
  const [hasStartedBefore, setHasStartedBefore] = useState(false);
  const callLimit = useCallLimit(callState);

  const actions = deriveCallActions(callState);
  const activeStates: Array<typeof callState> = ["listening", "agent_speaking"];
  const isActive = activeStates.includes(callState);

  function handleStart() {
    setHasStartedBefore(true);
    return startCall();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center px-6 py-10 text-center">
      <h1 className="sr-only">RelayPay Support</h1>

      <div className="flex flex-col items-center gap-2 pt-6">
        <Wordmark className="text-xl" />
        <p className="text-sm text-[var(--color-text-muted)]">Ask about payments, payouts, invoices or your account.</p>
        {callLimit && callState === "idle" && (
          <p className="text-xs text-[var(--color-text-muted)]">
            {callLimit.used} of {callLimit.limit} calls used today
          </p>
        )}
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-5 py-10">
        {textMode ? (
          <TextFallback accessToken={accessToken} onSwitchToVoice={() => setTextMode(false)} />
        ) : (
          <>
            <div className="flex items-center gap-3">
              <ActionButton action={handleStart} idleLabel="Start call" pendingLabel="Connecting…" state={actions.startCall} variant="primary" className="px-8 py-3 text-base" data-testid="start-call" />
              <ActionButton action={async () => endCall()} idleLabel="End call" pendingLabel="Ending…" state={actions.endCall} variant="secondary" data-testid="end-call" />
            </div>

            <LiveIndicator statusWord={actions.statusLine} active={isActive} />

            {isActive && remainingSeconds !== null && (
              <p className="text-xs text-[var(--color-text-muted)]" aria-live="off">
                {formatMmSs(remainingSeconds)} remaining
              </p>
            )}

            {callState === "ended" && endOfCallSummary ? <EndOfCallSummary summary={endOfCallSummary} /> : <Captions callerText={callerText} agentText={agentText} fullTranscript={fullTranscript} />}

            {!hasStartedBefore && callState === "idle" && <p className="max-w-xs text-xs text-[var(--color-text-muted)]">Your browser will ask for microphone access when you start a call.</p>}

            <ActionButton action={async () => setTextMode(true)} idleLabel="Type instead" state={actions.typeInstead} variant="ghost" className="text-xs" />
          </>
        )}
      </div>

      <div className="flex flex-col items-center gap-3 pb-2">
        {callState === "idle" && (
          <form action={onSignOut}>
            <button type="submit" className="text-xs text-[var(--color-text-muted)] [transition:color_var(--transition-fast)] hover:text-[var(--color-text)] hover:underline">
              Sign out
            </button>
          </form>
        )}
        <PrivacyNote />
      </div>
    </main>
  );
}
