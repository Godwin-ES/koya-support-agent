"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { AgentAvatar, UserAvatar } from "./avatars";

export interface ThreadMessage {
  role: "user" | "assistant";
  text: string;
}

type ThreadItem = ThreadMessage & { kind: "final" | "live" | "typing" | "streaming"; key: string; liveTail?: string };

export interface MessageThreadProps {
  messages: ThreadMessage[];
  /** Words still being spoken (a partial transcript) - shown, but not announced. */
  live?: ThreadMessage | null;
  /** Shows the agent's typing dots. */
  agentTyping?: boolean;
  /** The last message is still streaming in (text chat). */
  streamingLast?: boolean;
  userInitials: string;
  label: string;
  emptyState?: ReactNode;
  className?: string;
}

const STICK_THRESHOLD_PX = 80;

export function MessageThread({ messages, live, agentTyping, streamingLast, userInitials, label, emptyState, className }: MessageThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const [scrolledAway, setScrolledAway] = useState(false);

  // Voice transcripts arrive a sentence or clause at a time; consecutive
  // lines from one speaker read as one message, so they share one bubble.
  const items: ThreadItem[] = [];
  messages.forEach((m, i) => {
    if (streamingLast && i === messages.length - 1 && m.role === "assistant" && m.text === "") return;
    const kind = streamingLast && i === messages.length - 1 && m.role === "assistant" ? "streaming" : "final";
    const last = items[items.length - 1];
    if (last && last.role === m.role && last.kind === "final") {
      last.text = `${last.text} ${m.text}`.trim();
      last.kind = kind;
      return;
    }
    items.push({ ...m, kind, key: `m${i}` });
  });
  if (live?.text) {
    const last = items[items.length - 1];
    // Words still being spoken continue the speaker's current bubble; a new
    // speaker's get a bubble keyed as the final will be, so it doesn't remount.
    if (last && last.role === live.role && last.kind === "final") last.liveTail = live.text;
    else items.push({ ...live, kind: "live", key: `m${messages.length}` });
  }
  if (agentTyping && !(live?.role === "assistant" && live.text)) items.push({ role: "assistant", text: "", kind: "typing", key: "typing" });

  const groups: ThreadItem[][] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last[0]!.role === item.role) last.push(item);
    else groups.push([item]);
  }

  // Follows new messages only while the reader is already at the bottom -
  // scrolling up to reread never gets yanked back down (SYSTEM-DESIGN.md §11.6).
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, live, agentTyping]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD_PX;
    stickToBottomRef.current = atBottom;
    setScrolledAway(!atBottom);
  }

  function jumpToLatest() {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottomRef.current = true;
    el.scrollTop = el.scrollHeight;
    setScrolledAway(false);
  }

  return (
    <div className={cn("relative flex min-h-0 flex-1 flex-col", className)}>
      <div ref={scrollRef} onScroll={handleScroll} role="log" aria-live="polite" aria-label={label} tabIndex={0} className="min-h-0 flex-1 overflow-y-auto scroll-smooth px-4 py-5 focus-visible:outline-none sm:px-6">
        {groups.length === 0 ? (
          emptyState
        ) : (
          <ol className="flex flex-col gap-5">
            {groups.map((group) => (
              <MessageGroup key={group[0]!.key} items={group} userInitials={userInitials} />
            ))}
          </ol>
        )}
      </div>
      {scrolledAway && (
        <button
          type="button"
          onClick={jumpToLatest}
          className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 animate-fade-in items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] shadow-[var(--shadow-md)] [transition:background-color_var(--transition-fast)] hover:bg-[var(--color-surface-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
        >
          <ArrowDown className="size-3.5" aria-hidden="true" />
          Jump to latest
        </button>
      )}
    </div>
  );
}

function MessageGroup({ items, userInitials }: { items: ThreadItem[]; userInitials: string }) {
  const isUser = items[0]!.role === "user";
  return (
    <li className={cn("flex animate-message-in gap-3", isUser && "flex-row-reverse")}>
      {isUser ? <UserAvatar initials={userInitials} className="mt-5" /> : <AgentAvatar className="mt-5" />}
      <div className={cn("flex min-w-0 max-w-[85%] flex-col gap-1.5 sm:max-w-[75%]", isUser ? "items-end" : "items-start")}>
        <span className="px-1 text-xs font-medium text-[var(--color-text-muted)]">{isUser ? "You" : "RelayPay"}</span>
        {items.map((item) => (
          <Bubble key={item.key} item={item} />
        ))}
      </div>
    </li>
  );
}

function Bubble({ item }: { item: ThreadItem }) {
  const isUser = item.role === "user";
  const base = "whitespace-pre-wrap break-words px-4 py-2.5 text-[15px] leading-relaxed animate-message-in";
  const tone = isUser ? "rounded-2xl rounded-tr-md bg-[var(--color-primary)] text-white shadow-[var(--shadow-sm)]" : "rounded-2xl rounded-tl-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] shadow-[var(--shadow-sm)]";

  if (item.kind === "typing") {
    return (
      <div aria-hidden="true" className={cn(tone, "flex items-center gap-1 px-4 py-3.5")}>
        {[0, 150, 300].map((delay) => (
          <span key={delay} className="size-1.5 animate-typing-dot rounded-full bg-[var(--color-text-muted)]" style={{ animationDelay: `${delay}ms` }} />
        ))}
      </div>
    );
  }

  const caret = item.kind === "live" || item.kind === "streaming" || Boolean(item.liveTail);
  return (
    <p aria-hidden={item.kind === "live" ? true : undefined} className={cn(base, tone, item.kind === "live" && "opacity-70")}>
      {item.text}
      {item.liveTail && (
        <span aria-hidden="true" className="opacity-60">
          {" "}
          {item.liveTail}
        </span>
      )}
      {caret && <span aria-hidden="true" className={cn("ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] animate-caret rounded-full", isUser ? "bg-white/80" : "bg-[var(--color-accent)]")} />}
    </p>
  );
}
