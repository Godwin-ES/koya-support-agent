"use client";

import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { ArrowUp, CircleCheck, Hourglass, MessageSquarePlus, Phone } from "lucide-react";
import { deriveTextActions } from "@core/domain/text-actions";
import { ChatSendError, useTextChat, type ChatErrorCode } from "@/lib/use-text-chat";
import { useUsageLimits } from "@/lib/use-usage-limits";
import { cn } from "@/lib/utils";
import { ActionButton } from "@/components/primitives/action-button";
import { AgentAvatar } from "@/components/conversation/avatars";
import { MessageThread } from "@/components/conversation/message-thread";
import { TopicChips } from "@/components/conversation/topics";

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
const DEFAULT_MAX_CHARS = 1000;
const COUNTER_FROM_CHARS = 800;

type ClosingCode = "conversation_ended" | "conversation_message_limit" | "chat_daily_limit";
const CLOSING_CODES = new Set<ChatErrorCode>(["conversation_ended", "conversation_message_limit", "chat_daily_limit"]);

const INLINE_ERRORS: Partial<Record<ChatErrorCode, string>> = {
  message_too_long: "That message is too long. Shorten it and try again.",
  reply_in_progress: "Wait for the current reply to finish, then send again.",
  busy: "All our agents are busy. Please try again in a minute.",
  unavailable: "Couldn't send that. Check your connection and try again.",
};

function closingCopy(code: ClosingCode, perConversation: number, perDay: number): { title: string; body: string } {
  if (code === "conversation_ended") return { title: "This conversation was closed", body: "It closed after 15 minutes without a new message. Start a new one to keep going." };
  if (code === "conversation_message_limit") return { title: "This conversation is full", body: `A conversation can have up to ${perConversation} messages. Start a new one to keep going.` };
  return { title: "You've used today's chat messages", body: `You can send up to ${perDay} chat messages a day. Try again tomorrow, or start a call instead.` };
}

function resize(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_PX)}px`;
}

function TextChat({ accessToken, onSwitchToVoice, initialDraft, userInitials = "You", firstName, onNewConversation }: TextFallbackProps & { onNewConversation: () => void }) {
  const { turns, isStreaming, isEnded, hasSentAMessage, messagesSent, sendMessage, endConversation } = useTextChat(accessToken);
  const [draft, setDraft] = useState(initialDraft ?? "");
  const [sendError, setSendError] = useState<string | null>(null);
  const [closedBy, setClosedBy] = useState<ClosingCode | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Refetched each time a reply finishes, so the counts stay current.
  const chatLimits = useUsageLimits(accessToken, isStreaming ? -1 : messagesSent)?.chat ?? null;
  const maxChars = chatLimits?.max_chars ?? DEFAULT_MAX_CHARS;
  const leftToday = chatLimits ? Math.max(0, chatLimits.limit - chatLimits.used) : null;
  const leftInConversation = chatLimits ? Math.max(0, chatLimits.per_conversation - messagesSent) : null;
  const closing = closedBy ?? (leftToday === 0 && !isStreaming ? "chat_daily_limit" : null);
  const allowanceHint =
    leftInConversation !== null && leftInConversation <= 5 ? `${leftInConversation} ${leftInConversation === 1 ? "message" : "messages"} left in this conversation` : leftToday !== null && leftToday <= 10 ? `${leftToday} ${leftToday === 1 ? "message" : "messages"} left today` : null;

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
    setSendError(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    try {
      await sendMessage(message);
    } catch (err) {
      const code: ChatErrorCode = err instanceof ChatSendError ? err.code : "unavailable";
      if (CLOSING_CODES.has(code)) {
        setClosedBy(code as ClosingCode);
        return;
      }
      setDraft(message);
      setSendError(INLINE_ERRORS[code] ?? INLINE_ERRORS.unavailable!);
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
        messages={[{ role: "assistant", text: firstName ? `Hi ${firstName}, how can I help you today?` : "Hi, how can I help you today?" }, ...turns]}
        agentTyping={agentTyping}
        streamingLast={isStreaming}
        userInitials={userInitials}
        label="Conversation"
        className="bg-[var(--color-bg)]"
      />

      {closing && !isEnded ? (
        <div role="status" className="flex animate-message-in flex-col items-center gap-4 border-t border-[var(--color-border)] bg-[var(--color-warning-bg)] px-5 py-5 text-center sm:flex-row sm:text-left">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/70 text-[var(--color-warning-text)]">
            <Hourglass className="size-5" aria-hidden="true" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-[var(--color-text)]">{closingCopy(closing, chatLimits?.per_conversation ?? 30, chatLimits?.limit ?? 90).title}</p>
            <p className="mt-0.5 text-sm text-[var(--color-text-muted)]">{closingCopy(closing, chatLimits?.per_conversation ?? 30, chatLimits?.limit ?? 90).body}</p>
          </div>
          {closing !== "chat_daily_limit" && (
            <button
              type="button"
              onClick={onNewConversation}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white shadow-[var(--shadow-sm)] [transition:background-color_var(--transition-fast)] hover:bg-[var(--color-accent-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
            >
              <MessageSquarePlus className="size-4" aria-hidden="true" />
              New conversation
            </button>
          )}
        </div>
      ) : isEnded ? (
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
          {!hasSentAMessage && (
            <div className="mb-3">
              <TopicChips onPick={pickTopic} />
            </div>
          )}
          {sendError && (
            <p role="alert" className="mb-2 px-1 text-sm text-[var(--color-danger-text)]">
              {sendError}
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
              maxLength={maxChars}
              rows={1}
              className="max-h-40 min-h-6 flex-1 resize-none bg-transparent py-2 text-[15px] leading-6 text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-muted)]"
            />
            <ActionButton action={handleSend} idleLabel="Send" state={actions.send} variant="primary" icon={<ArrowUp className="size-4" aria-hidden="true" />} className="rounded-[var(--radius-lg)] px-3.5 hover:translate-y-0" />
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 px-1 text-[11px] text-[var(--color-text-muted)]">
            <p className="hidden sm:block">
              <kbd className="font-sans font-semibold">Enter</kbd> to send · <kbd className="font-sans font-semibold">Shift + Enter</kbd> for a new line
            </p>
            <p className="ml-auto flex items-center gap-3">
              {allowanceHint && <span>{allowanceHint}</span>}
              {draft.length >= COUNTER_FROM_CHARS && <span className={cn("tabular-nums", draft.length >= maxChars && "font-semibold text-[var(--color-warning-text)]")}>{draft.length.toLocaleString()} / {maxChars.toLocaleString()}</span>}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
