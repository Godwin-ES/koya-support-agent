"use client";

import { useCallback, useRef, useState } from "react";

export interface TextTurn {
  role: "user" | "assistant";
  text: string;
}

/** The text fallback (SYSTEM-DESIGN.md §11.7, §3: "the same session code, streaming to the browser instead of Vapi, channel = web_text"). `accessToken` is the signed-in caller's Supabase session token - see use-voice-call.ts's own note on why this replaced browser-id hashing. */
export function useTextChat(accessToken: string) {
  const [turns, setTurns] = useState<TextTurn[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isEnded, setIsEnded] = useState(false);
  const conversationRef = useRef<{ id: string; token: string } | null>(null);

  const ensureConversation = useCallback(async (): Promise<{ id: string; token: string }> => {
    if (conversationRef.current) return conversationRef.current;
    const res = await fetch(`${process.env.NEXT_PUBLIC_AGENT_SERVER_URL}/api/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: "web_text", access_token: accessToken }),
    });
    if (!res.ok) throw new Error(`POST /api/conversations failed: ${res.status}`);
    const conversation = (await res.json()) as { conversation_id: string; token: string };
    conversationRef.current = { id: conversation.conversation_id, token: conversation.token };
    return conversationRef.current;
  }, [accessToken]);

  const sendMessage = useCallback(
    async (message: string) => {
      const conversation = await ensureConversation();
      setTurns((prev) => [...prev, { role: "user", text: message }]);
      setIsStreaming(true);

      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_AGENT_SERVER_URL}/api/text`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversation_id: conversation.id, token: conversation.token, message }),
        });
        if (!res.ok || !res.body) throw new Error(`POST /api/text failed: ${res.status}`);

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

  return { turns, isStreaming, isEnded, hasSentAMessage: turns.length > 0, sendMessage, endConversation };
}
