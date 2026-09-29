"use client";

import { useState, type KeyboardEvent } from "react";
import { deriveTextActions } from "@core/domain/text-actions";
import { useTextChat } from "@/lib/use-text-chat";
import { ActionButton } from "@/components/primitives/action-button";

export function TextFallback({ accessToken, onSwitchToVoice }: { accessToken: string; onSwitchToVoice: () => void }) {
  const { turns, isStreaming, isEnded, hasSentAMessage, sendMessage, endConversation } = useTextChat(accessToken);
  const [draft, setDraft] = useState("");

  const actions = deriveTextActions({ draftIsEmpty: draft.trim().length === 0, isStreaming, hasSentAMessage });

  async function handleSend() {
    if (actions.send.kind !== "enabled") return;
    const message = draft;
    setDraft("");
    await sendMessage(message);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  }

  if (isEnded) {
    return (
      <div role="status" className="w-full max-w-md rounded-[var(--radius-md)] bg-[var(--color-surface-2)] p-4 text-center text-sm text-[var(--color-text)]">
        Thanks for chatting. If you need more help, start a new call or conversation.
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div aria-live="polite" className="max-h-72 space-y-2 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 text-sm">
        {turns.length === 0 && <p className="text-[var(--color-text-muted)]">Ask about payments, payouts, invoices or your account.</p>}
        {turns.map((turn, index) => (
          <p key={index}>
            <span className="font-medium text-[var(--color-text-muted)]">{turn.role === "user" ? "You" : "RelayPay"}: </span>
            {turn.text}
          </p>
        ))}
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type a message"
        aria-label="Type a message"
        rows={2}
        className="w-full resize-none rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
      />
      <div className="flex justify-between gap-2">
        <ActionButton action={handleSend} idleLabel="Send" state={actions.send} variant="primary" />
        <div className="flex gap-2">
          <ActionButton action={async () => onSwitchToVoice()} idleLabel="Switch to voice" state={actions.switchToVoice} variant="secondary" />
          <ActionButton action={endConversation} idleLabel="End conversation" state={actions.endConversation} variant="ghost" />
        </div>
      </div>
    </div>
  );
}
