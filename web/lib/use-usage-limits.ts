"use client";

import { useEffect, useState } from "react";

export interface CallLimitStatus {
  used: number;
  limit: number;
}

export interface ChatLimitStatus {
  used: number;
  limit: number;
  per_conversation: number;
  max_chars: number;
}

export interface UsageLimits {
  calls: CallLimitStatus;
  chat: ChatLimitStatus;
}

/** Today's calls and chat messages, counted separately (SYSTEM-DESIGN.md §9). The request carries the caller's session token, which agent-server verifies. Refetches whenever `refreshKey` changes (a call ending, a reply arriving). */
export function useUsageLimits(accessToken: string, refreshKey: unknown): UsageLimits | null {
  const [status, setStatus] = useState<UsageLimits | null>(null);

  useEffect(() => {
    const url = `${process.env.NEXT_PUBLIC_AGENT_SERVER_URL}/api/limits`;

    let cancelled = false;
    // In a header, not the URL - URLs end up in proxy logs.
    fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((res) => (res.ok ? (res.json() as Promise<UsageLimits>) : null))
      .then((data) => {
        if (!cancelled && data?.calls && data.chat) setStatus(data);
      })
      .catch(() => undefined); // silent - this is a nice-to-have display, not load-bearing

    return () => {
      cancelled = true;
    };
  }, [accessToken, refreshKey]);

  return status;
}
