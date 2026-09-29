"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Vapi from "@vapi-ai/web";
import type { CallState } from "@core/domain/call-actions";

// Confirmed against docs.vapi.ai/sdk/web (Task 10): 'speech-start'/'speech-end'
// mark the assistant speaking (not the caller), and a transcript arrives as
// a 'message' event shaped { type: 'transcript', role, transcript,
// transcriptType: 'partial' | 'final' }. Finals go into the transcript;
// the latest partial is kept separately so the page can show words as
// they're spoken without the transcript itself flickering.
interface TranscriptMessage {
  type: "transcript";
  role: "user" | "assistant";
  transcript: string;
  transcriptType: "partial" | "final";
}

function isTranscriptMessage(message: unknown): message is TranscriptMessage {
  return typeof message === "object" && message !== null && (message as { type?: unknown }).type === "transcript";
}

export interface TranscriptTurn {
  role: "user" | "assistant";
  text: string;
}

export interface EndOfCallSummary {
  /** What happens next, when this call created an escalation or a ticket (SYSTEM-DESIGN.md §11.7) - null otherwise. */
  followUpSummary: string | null;
  /** That escalation's or ticket's reference, for the caller to quote. */
  reference?: string | null;
  /** Set when useVoiceCall itself ended the call after 30s of caller silence, rather than the caller hanging up (SYSTEM-DESIGN.md §9 - Vapi has no such field itself, confirmed against its live API in Task 13, so this is enforced client-side). */
  endedDueToSilence: boolean;
  /** How long the call was connected, when it connected at all. */
  durationSeconds?: number | null;
}

interface Outcome {
  escalation: { reference: string; category: string; callback_time: string | null } | null;
  ticket: { reference: string; category: string } | null;
}

function formatCallback(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });
}

async function fetchOutcome(conversation: { id: string; token: string }): Promise<Pick<EndOfCallSummary, "followUpSummary" | "reference"> | null> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_AGENT_SERVER_URL}/api/conversations/${conversation.id}/outcome`, { headers: { Authorization: `Bearer ${conversation.token}` } });
  if (!res.ok) return null;
  const outcome = (await res.json()) as Outcome;
  if (outcome.escalation) {
    const { callback_time, reference } = outcome.escalation;
    return {
      reference,
      followUpSummary: callback_time ? `A specialist will call you on ${formatCallback(callback_time)}, and follow up by email.` : "A specialist will follow up by email within one business day.",
    };
  }
  if (outcome.ticket) return { reference: outcome.ticket.reference, followUpSummary: "Our support team will look into this and follow up by email." };
  return null;
}

/** SYSTEM-DESIGN.md §9: the two client-visible call limits. Vapi enforces `MAX_CALL_SECONDS` itself server-side (`maxDurationSeconds` on the assistant) - this is only the matching visual countdown. `SILENCE_TIMEOUT_MS` has no Vapi-side equivalent at all (verified against its live API, Task 13) and is enforced entirely here. */
export const MAX_CALL_SECONDS = 300;
const SILENCE_TIMEOUT_MS = 30_000;

/** `accessToken` is the signed-in caller's Supabase session token (from `page.tsx`'s server-side session check) - agent-server verifies it (`supabase.auth.getUser(token)`) to derive `caller_ref` for the daily limit, replacing the old IP+browser-id hash now that every caller has a real account. */
export function useVoiceCall(accessToken: string) {
  const [callState, setCallState] = useState<CallState>("idle");
  const [fullTranscript, setFullTranscript] = useState<TranscriptTurn[]>([]);
  const [endOfCallSummary, setEndOfCallSummary] = useState<EndOfCallSummary | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [partial, setPartial] = useState<TranscriptTurn | null>(null);

  const vapiRef = useRef<Vapi | null>(null);
  const conversationRef = useRef<{ id: string; token: string } | null>(null);
  const lastActivityAtRef = useRef<number>(0);
  const callStartedAtRef = useRef<number>(0);
  const endedDueToSilenceRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Volume arrives many times a second - listeners are called directly so
  // the orb can animate without re-rendering the whole page.
  const volumeListenersRef = useRef(new Set<(volume: number) => void>());

  const getVapi = useCallback((): Vapi => {
    if (!vapiRef.current) {
      // Playwright's Vapi stub (TESTING-GUIDE.md, Task 10 §11.12): a real
      // browser can't place a real call in CI, so an e2e run injects a
      // stand-in with the same on/start/stop shape onto `window` before
      // this ever runs. Never set outside a test - production always
      // constructs the real client.
      const stub = (globalThis as { __VAPI_STUB__?: Vapi }).__VAPI_STUB__;
      const vapi = stub ?? new Vapi(process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY!);
      vapi.on("call-start", () => {
        callStartedAtRef.current = Date.now();
        lastActivityAtRef.current = Date.now();
        setCallState("listening");
      });
      vapi.on("speech-start", () => {
        lastActivityAtRef.current = Date.now();
        setCallState("agent_speaking");
      });
      vapi.on("speech-end", () => setCallState((s) => (s === "agent_speaking" ? "listening" : s)));
      vapi.on("call-end", () => {
        // "What happens next" comes from the records this call created
        // (SYSTEM-DESIGN.md §11.7), fetched once it ends - not from the
        // agent's last spoken line, which Vapi delivers a clause at a time
        // (a live call showed a bare "transfers." here).
        const durationSeconds = callStartedAtRef.current ? Math.round((Date.now() - callStartedAtRef.current) / 1000) : null;
        const base: EndOfCallSummary = { followUpSummary: null, reference: null, endedDueToSilence: endedDueToSilenceRef.current, durationSeconds };
        setEndOfCallSummary(base);
        const conversation = conversationRef.current;
        if (conversation) {
          void fetchOutcome(conversation)
            .then((outcome) => outcome && setEndOfCallSummary({ ...base, ...outcome }))
            .catch(() => undefined);
        }
        setPartial(null);
        setCallState((s) => (s === "ending" ? "ended" : "dropped"));
      });
      vapi.on("volume-level", (volume: number) => {
        for (const listener of volumeListenersRef.current) listener(volume);
      });
      vapi.on("error", (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        if (/permission|microphone|NotAllowedError/i.test(message)) {
          setCallState("mic_blocked");
          return;
        }
        setCallState((s) => (s === "requesting" || s === "connecting" ? "unavailable" : "dropped"));
      });
      vapi.on("message", (message: unknown) => {
        if (!isTranscriptMessage(message)) return;
        // A partial means someone is mid-sentence, so it counts as activity
        // too - otherwise a long caller sentence could trip the silence timeout.
        lastActivityAtRef.current = Date.now();
        if (message.transcriptType !== "final") {
          setPartial({ role: message.role, text: message.transcript });
          return;
        }
        setPartial(null);
        setFullTranscript((prev) => [...prev, { role: message.role, text: message.transcript }]);
      });
      vapiRef.current = vapi;
    }
    return vapiRef.current;
  }, []);

  const startCall = useCallback(async () => {
    setCallState("requesting");
    setFullTranscript([]);
    setEndOfCallSummary(null);
    setRemainingSeconds(null);
    setPartial(null);
    endedDueToSilenceRef.current = false;
    callStartedAtRef.current = 0;

    let res: Response;
    try {
      res = await fetch(`${process.env.NEXT_PUBLIC_AGENT_SERVER_URL}/api/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: "web_voice", access_token: accessToken }),
      });
    } catch {
      setCallState("unavailable");
      return;
    }

    if (res.status === 429) {
      setCallState("limit_reached");
      return;
    }
    if (res.status === 503) {
      setCallState("busy");
      return;
    }
    if (!res.ok) {
      setCallState("unavailable");
      return;
    }

    const { conversation_id, token } = (await res.json()) as { conversation_id: string; token: string };
    conversationRef.current = { id: conversation_id, token };

    setCallState("connecting");
    try {
      await getVapi().start(process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID!, { metadata: { conversation_id, token } });
    } catch {
      setCallState("unavailable");
    }
  }, [getVapi, accessToken]);

  const endCall = useCallback(() => {
    setCallState("ending");
    vapiRef.current?.stop();
  }, []);

  // The visible 5-minute countdown (matches maxDurationSeconds, which Vapi
  // enforces itself - this is purely the display) and the 30-second
  // silence timeout (which Vapi does not enforce at all - SYSTEM-DESIGN.md
  // §9, verified against Vapi's live API in Task 13). Ticks once a second
  // only while the call is actually connected.
  useEffect(() => {
    const active = callState === "listening" || callState === "agent_speaking";
    if (!active) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }
    const tick = () => {
      const elapsedCallMs = Date.now() - callStartedAtRef.current;
      setRemainingSeconds(Math.max(0, MAX_CALL_SECONDS - Math.floor(elapsedCallMs / 1000)));

      // Silence is measured against the caller alone: the agent's own
      // speech-start already refreshes lastActivityAtRef, so this only
      // fires while the caller has been quiet with the agent also quiet
      // (state === "listening") for the full window - not mid-reply.
      if (callState === "listening" && Date.now() - lastActivityAtRef.current >= SILENCE_TIMEOUT_MS) {
        endedDueToSilenceRef.current = true;
        setCallState("ending");
        vapiRef.current?.stop();
      }
    };
    tick(); // shows "5:00" immediately instead of a blank second before the first tick
    timerRef.current = setInterval(tick, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callState]);

  useEffect(
    () => () => {
      vapiRef.current?.stop();
    },
    [],
  );

  const subscribeToVolume = useCallback((listener: (volume: number) => void) => {
    volumeListenersRef.current.add(listener);
    return () => {
      volumeListenersRef.current.delete(listener);
    };
  }, []);

  return { callState, fullTranscript, partial, endOfCallSummary, remainingSeconds, startCall, endCall, subscribeToVolume };
}
