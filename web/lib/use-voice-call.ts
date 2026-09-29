"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Vapi from "@vapi-ai/web";
import type { CallState } from "@core/domain/call-actions";

// Confirmed against docs.vapi.ai/sdk/web (Task 10): 'speech-start'/'speech-end'
// mark the assistant speaking (not the caller), and a transcript arrives as
// a 'message' event shaped { type: 'transcript', role, transcript,
// transcriptType: 'partial' | 'final' } - only 'final' transcripts are kept,
// so captions don't flicker with every partial word.
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
  /** The tool's own follow_up_summary (SYSTEM-DESIGN.md §11.7), when a ticket or escalation was created this call. */
  followUpSummary: string | null;
}

const BROWSER_ID_STORAGE_KEY = "relaypay_browser_id";

function getOrCreateBrowserId(): string {
  try {
    const existing = localStorage.getItem(BROWSER_ID_STORAGE_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(BROWSER_ID_STORAGE_KEY, id);
    return id;
  } catch {
    // Storage blocked (private window, disabled cookies/storage) - a
    // fresh id every call still works, it just won't help the daily
    // limit tell this visitor apart from a new tab on a shared IP.
    return crypto.randomUUID();
  }
}

export function useVoiceCall() {
  const [callState, setCallState] = useState<CallState>("idle");
  const [callerText, setCallerText] = useState("");
  const [agentText, setAgentText] = useState("");
  const [fullTranscript, setFullTranscript] = useState<TranscriptTurn[]>([]);
  const [endOfCallSummary, setEndOfCallSummary] = useState<EndOfCallSummary | null>(null);

  const vapiRef = useRef<Vapi | null>(null);
  const conversationRef = useRef<{ id: string; token: string } | null>(null);

  const getVapi = useCallback((): Vapi => {
    if (!vapiRef.current) {
      // Playwright's Vapi stub (TESTING-GUIDE.md, Task 10 §11.12): a real
      // browser can't place a real call in CI, so an e2e run injects a
      // stand-in with the same on/start/stop shape onto `window` before
      // this ever runs. Never set outside a test - production always
      // constructs the real client.
      const stub = (globalThis as { __VAPI_STUB__?: Vapi }).__VAPI_STUB__;
      const vapi = stub ?? new Vapi(process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY!);
      vapi.on("call-start", () => setCallState("listening"));
      vapi.on("speech-start", () => setCallState("agent_speaking"));
      vapi.on("speech-end", () => setCallState((s) => (s === "agent_speaking" ? "listening" : s)));
      vapi.on("call-end", () => {
        // "What was covered... taken from the tool's follow_up_summary"
        // (SYSTEM-DESIGN.md §11.7): the agent is instructed (system-prompt.ts)
        // to speak that summary back to the caller as its own last reply
        // when it escalates, so the last assistant transcript line already
        // carries it - no separate authenticated fetch needed to show it.
        setAgentText((lastAgentLine) => {
          setEndOfCallSummary({ followUpSummary: lastAgentLine || null });
          return lastAgentLine;
        });
        setCallState((s) => (s === "ending" ? "ended" : "dropped"));
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
        if (!isTranscriptMessage(message) || message.transcriptType !== "final") return;
        if (message.role === "user") setCallerText(message.transcript);
        else setAgentText(message.transcript);
        setFullTranscript((prev) => [...prev, { role: message.role, text: message.transcript }]);
      });
      vapiRef.current = vapi;
    }
    return vapiRef.current;
  }, []);

  const startCall = useCallback(async () => {
    setCallState("requesting");
    setCallerText("");
    setAgentText("");
    setFullTranscript([]);
    setEndOfCallSummary(null);

    let res: Response;
    try {
      res = await fetch(`${process.env.NEXT_PUBLIC_AGENT_SERVER_URL}/api/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: "web_voice", browser_id: getOrCreateBrowserId() }),
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
  }, [getVapi]);

  const endCall = useCallback(() => {
    setCallState("ending");
    vapiRef.current?.stop();
  }, []);

  useEffect(
    () => () => {
      vapiRef.current?.stop();
    },
    [],
  );

  return { callState, callerText, agentText, fullTranscript, endOfCallSummary, startCall, endCall };
}
