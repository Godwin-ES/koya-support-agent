"use client";

import { useState } from "react";
import { deriveCallActions } from "@core/domain/call-actions";
import { useVoiceCall } from "@/lib/use-voice-call";
import { Wordmark } from "@/components/brand/wordmark";
import { ActionButton } from "@/components/primitives/action-button";
import { LiveIndicator } from "@/components/voice/live-indicator";
import { Captions } from "@/components/voice/captions";
import { PrivacyNote } from "@/components/voice/privacy-note";
import { EndOfCallSummary } from "@/components/voice/end-of-call-summary";
import { TextFallback } from "@/components/voice/text-fallback";

/** The voice page (SYSTEM-DESIGN.md §11.7) - the one screen customers see. */
export default function VoicePage() {
  const { callState, callerText, agentText, fullTranscript, endOfCallSummary, startCall, endCall } = useVoiceCall();
  const [textMode, setTextMode] = useState(false);
  const [hasStartedBefore, setHasStartedBefore] = useState(false);

  const actions = deriveCallActions(callState);
  const activeStates: Array<typeof callState> = ["listening", "agent_speaking"];

  function handleStart() {
    setHasStartedBefore(true);
    return startCall();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center gap-6 px-6 py-10 text-center">
      <h1 className="sr-only">RelayPay Support</h1>
      <Wordmark />
      <p className="text-sm text-[var(--color-text-muted)]">Ask about payments, payouts, invoices or your account.</p>

      {textMode ? (
        <TextFallback onSwitchToVoice={() => setTextMode(false)} />
      ) : (
        <>
          <ActionButton action={handleStart} idleLabel="Start call" pendingLabel="Connecting…" state={actions.startCall} variant="primary" className="px-8 py-3 text-base" data-testid="start-call" />
          <ActionButton action={async () => endCall()} idleLabel="End call" pendingLabel="Ending…" state={actions.endCall} variant="secondary" data-testid="end-call" />

          <LiveIndicator statusWord={actions.statusLine} active={activeStates.includes(callState)} />

          {callState === "ended" && endOfCallSummary ? <EndOfCallSummary summary={endOfCallSummary} /> : <Captions callerText={callerText} agentText={agentText} fullTranscript={fullTranscript} />}

          {!hasStartedBefore && callState === "idle" && <p className="text-xs text-[var(--color-text-muted)]">Your browser will ask for microphone access when you start a call.</p>}

          <ActionButton action={async () => setTextMode(true)} idleLabel="Type instead" state={actions.typeInstead} variant="ghost" className="text-xs" />
        </>
      )}

      <PrivacyNote />
    </main>
  );
}
