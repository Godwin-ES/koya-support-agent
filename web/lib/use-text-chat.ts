"use client";

import { useCallback, useRef, useState } from "react";

export interface TextTurn {
  role: "user" | "assistant";
  text: string;
}

/** Why a message couldn't be sent - agent-server's own refusal codes, plus the two network cases. */
export type ChatErrorCode = "message_too_long" | "reply_in_progress" | "conversation_message_limit" | "chat_daily_limit" | "conversation_ended" | "busy" | "unavailable";

export class ChatSendError extends Error {
  constructor(readonly code: ChatErrorCode) {
    super(code);
    this.name = "ChatSendError";
  }
}

const KNOWN_CODES = new Set<ChatErrorCode>(["message_too_long", "reply_in_progress", "conversation_message_limit", "chat_daily_limit", "conversation_ended"]);

async function errorCodeFrom(res: Response): Promise<ChatErrorCode> {
  if (res.status === 503) return "busy";
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  const code = body?.error as ChatErrorCode | undefined;
  if (code && KNOWN_CODES.has(code)) return code;
  if (res.status === 429) return "chat_daily_limit";
  return "unavailable";
}

/** The text fallback (SYSTEM-DESIGN.md §11.7, §3: "the same session code, streaming to the browser instead of Vapi, channel = web_text"). `accessToken` is the signed-in caller's Supabase session token. */
export function useTextChat(accessToken: string) {
  const [turns, setTurns] = useState<TextTurn[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isEnded, setIsEnded] = useState(false);
  const conversationRef = useRef<{ id: string; token: string } | null>(null);

  const ensureConversation = useCallback(async (): Promise<{ id: string; token: string }> => {
    if (conversationRef.current) return conversationRef.current;
    let res: Response;
    try {
      res = await fetch(`${process.env.NEXT_PUBLIC_AGENT_SERVER_URL}/api/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: "web_text", access_token: accessToken }),
      });
    } catch {
      throw new ChatSendError("unavailable");
    }
    if (!res.ok) throw new ChatSendError(await errorCodeFrom(res));
    const conversation = (await res.json()) as { conversation_id: string; token: string };
    conversationRef.current = { id: conversation.conversation_id, token: conversation.token };
    return conversationRef.current;
  }, [accessToken]);

  /** Throws ChatSendError when the message wasn't accepted - it's then removed from the thread, so the page can put it back in the box. */
  const sendMessage = useCallback(
    async (message: string) => {
      const conversation = await ensureConversation();
      setTurns((prev) => [...prev, { role: "user", text: message }]);
      setIsStreaming(true);

      try {
        let res: Response;
        try {
          res = await fetch(`${process.env.NEXT_PUBLIC_AGENT_SERVER_URL}/api/text`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ conversation_id: conversation.id, token: conversation.token, message }),
          });
        } catch {
          throw new ChatSendError("unavailable");
        }
        if (!res.ok || !res.body) {
          const code = res.ok ? "unavailable" : await errorCodeFrom(res);
          setTurns((prev) => prev.slice(0, -1));
          throw new ChatSendError(code);
        }

        setTurns((prev) => [...prev, { role: "assistant", text: "" }]);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice("data: ".length);
            if (payload === "[DONE]") continue;
            const { text } = JSON.parse(payload) as { text: string };
            setTurns((prev) => {
              const next = [...prev];
              const last = next[next.length - 1]!;
              next[next.length - 1] = { ...last, text: last.text + text };
              return next;
            });
          }
        }
      } finally {
        setIsStreaming(false);
      }
    },
    [ensureConversation],
  );

  const endConversation = useCallback(async () => {
    const conversation = conversationRef.current;
    if (!conversation) return;
    await fetch(`${process.env.NEXT_PUBLIC_AGENT_SERVER_URL}/api/text/end`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: conversation.id, token: conversation.token }),
    });
    setIsEnded(true);
  }, []);

  const messagesSent = turns.filter((t) => t.role === "user").length;
  return { turns, isStreaming, isEnded, hasSentAMessage: turns.length > 0, messagesSent, sendMessage, endConversation };
}
