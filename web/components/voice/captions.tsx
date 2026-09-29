"use client";

import { useState } from "react";
import type { TranscriptTurn } from "@/lib/use-voice-call";

export interface CaptionsProps {
  callerText: string;
  agentText: string;
  fullTranscript: TranscriptTurn[];
}

/**
 * "The current exchange only (the caller's last sentence and the agent's
 * reply), with 'Show full transcript' to expand - not a chat log (the
 * brand says not chat-heavy)." `aria-live="polite"` so screen readers
 * follow along. (SYSTEM-DESIGN.md §11.7)
 */
export function Captions({ callerText, agentText, fullTranscript }: CaptionsProps) {
  const [expanded, setExpanded] = useState(false);

  if (!callerText && !agentText) return null;

  return (
    <div className="w-full max-w-md">
      <div aria-live="polite" className="space-y-2 rounded-[var(--radius-md)] bg-[var(--color-surface-2)] p-4 text-sm">
        {callerText && (
          <p>
            <span className="font-medium text-[var(--color-text-muted)]">You: </span>
            {callerText}
          </p>
        )}
        {agentText && (
          <p>
            <span className="font-medium text-[var(--color-text-muted)]">RelayPay: </span>
            {agentText}
          </p>
        )}
      </div>
      {fullTranscript.length > 2 && (
        <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-2 text-xs font-medium text-[var(--color-accent)] hover:underline" aria-expanded={expanded}>
          {expanded ? "Hide full transcript" : "Show full transcript"}
        </button>
      )}
      {expanded && (
        <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 text-xs">
          {fullTranscript.map((turn, index) => (
            <li key={index}>
              <span className="font-medium text-[var(--color-text-muted)]">{turn.role === "user" ? "You" : "RelayPay"}: </span>
              {turn.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
