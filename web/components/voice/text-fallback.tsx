"use client";

import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { ArrowUp, CircleCheck, MessageSquarePlus, Phone } from "lucide-react";
import { deriveTextActions } from "@core/domain/text-actions";
import { useTextChat } from "@/lib/use-text-chat";
import { ActionButton } from "@/components/primitives/action-button";
import { AgentAvatar } from "@/components/conversation/avatars";
import { MessageThread } from "@/components/conversation/message-thread";
import { TopicGrid } from "@/components/conversation/topics";

export interface TextFallbackProps {
  accessToken: string;
  onSwitchToVoice: () => void;
  initialDraft?: string;
  userInitials?: string;
  firstName?: string | null;
}

/** Each "New conversation" remounts the chat, so it starts a fresh server conversation. */
export function TextFallback({ initialDraft, ...props }: TextFallbackProps) {
  const [session, setSession] = useState(0);
  return <TextChat key={session} {...props} initialDraft={session === 0 ? initialDraft : undefined} onNewConversation={() => setSession((s) => s + 1)} />;
}

const MAX_TEXTAREA_PX = 160;

function resize(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_PX)}px`;
}

function TextChat({ accessToken, onSwitchToVoice, initialDraft, userInitials = "You", firstName, onNewConversation }: TextFallbackProps & { onNewConversation: () => void }) {
  const { turns, isStreaming, isEnded, hasSentAMessage, sendMessage, endConversation } = useTextChat(accessToken);
  const [draft, setDraft] = useState(initialDraft ?? "");
  const [sendError, setSendError] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const actions = deriveTextActions({ draftIsEmpty: draft.trim().length === 0, isStreaming, hasSentAMessage });
  const last = turns[turns.length - 1];
  const agentTyping = isStreaming && (!last || last.role === "user" || last.text === "");

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    resize(el);
  }, []);

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setDraft(event.target.value);
    resize(event.target);
  }

  async function handleSend() {
    if (actions.send.kind !== "enabled") return;
    const message = draft;
    setDraft("");
    setSendError(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    try {
      await sendMessage(message);
    } catch {
      setSendError(true);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  }

  function pickTopic(prompt: string) {
    setDraft(prompt);
    const el = textareaRef.current;
    if (!el) return;
    el.value = prompt;
    resize(el);
    el.focus();
  }

  return (
    <section aria-label="Chat with RelayPay" className="mx-auto flex h-[calc(100dvh-10rem)] min-h-[440px] sm:h-[min(760px,calc(100dvh-11rem))] w-full max-w-3xl animate-fade-in flex-col overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-xl)]">
      <header className="flex flex-col gap-3 border-b border-[var(--color-border)] px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <AgentAvatar className="size-10" />
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-[var(--color-text)]">RelayPay Support</h2>
            <p className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
              <span className="size-1.5 rounded-full bg-[var(--color-success-text)]" aria-hidden="true" />
              {isStreaming ? "Typing…" : "Usually replies in a few seconds"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ActionButton action={async () => onSwitchToVoice()} idleLabel="Switch to voice" state={actions.switchToVoice} variant="secondary" icon={<Phone className="size-3.5" aria-hidden="true" />} className="rounded-full px-3 py-1.5 text-xs" />
          {!isEnded && <ActionButton action={endConversation} idleLabel="End conversation" state={actions.endConversation} variant="ghost" className="rounded-full px-3 py-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]" />}
        </div>
      </header>

      <MessageThread
        messages={turns}
        agentTyping={agentTyping}
        streamingLast={isStreaming}
        userInitials={userInitials}
        label="Conversation"
        className="bg-[var(--color-bg)]"
        emptyState={
          <div className="mx-auto flex max-w-lg flex-col items-center py-6 text-center">
            <AgentAvatar className="size-12" />
            <p className="mt-4 text-lg font-semibold text-[var(--color-text)]">{firstName ? `Hi ${firstName}, how can we help?` : "How can we help?"}</p>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">Ask anything about payments, payouts, invoices or your account.</p>
            <TopicGrid onPick={pickTopic} compact className="mt-6" />
          </div>
        }
      />

      {isEnded ? (
        <div role="status" className="flex animate-message-in flex-col items-center gap-4 border-t border-[var(--color-border)] bg-[var(--color-accent-softer)] px-5 py-5 text-center sm:flex-row sm:text-left">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--color-success-bg)] text-[var(--color-success-text)]">
            <CircleCheck className="size-5" aria-hidden="true" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-[var(--color-text)]">Conversation ended</p>
            <p className="mt-0.5 text-sm text-[var(--color-text-muted)]">Thanks for chatting. If you need more help, start a new call or conversation.</p>
          </div>
          <button
            type="button"
            onClick={onNewConversation}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white shadow-[var(--shadow-sm)] [transition:background-color_var(--transition-fast)] hover:bg-[var(--color-accent-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          >
            <MessageSquarePlus className="size-4" aria-hidden="true" />
            New conversation
          </button>
        </div>
      ) : (
        <div className="border-t border-[var(--color-border)] bg-[var(--color-surface)] p-3 sm:p-4">
          {sendError && (
            <p role="alert" className="mb-2 px-1 text-sm text-[var(--color-danger-text)]">
              Couldn&apos;t send that. Check your connection and try again.
            </p>
          )}
          <div className="flex items-end gap-2 rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 pl-4 shadow-[var(--shadow-sm)] [transition:border-color_var(--transition-fast),box-shadow_var(--transition-fast)] focus-within:border-[var(--color-accent)] focus-within:shadow-[0_0_0_4px_rgb(29_122_130_/_0.12)]">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder="Message RelayPay…"
              aria-label="Type a message"
              rows={1}
              className="max-h-40 min-h-6 flex-1 resize-none bg-transparent py-2 text-[15px] leading-6 text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-muted)]"
            />
            <ActionButton action={handleSend} idleLabel="Send" state={actions.send} variant="primary" icon={<ArrowUp className="size-4" aria-hidden="true" />} className="rounded-[var(--radius-lg)] px-3.5 hover:translate-y-0" />
          </div>
          <p className="mt-2 hidden px-1 text-[11px] text-[var(--color-text-muted)] sm:block">
            <kbd className="font-sans font-semibold">Enter</kbd> to send · <kbd className="font-sans font-semibold">Shift + Enter</kbd> for a new line
          </p>
        </div>
      )}
    </section>
  );
}
