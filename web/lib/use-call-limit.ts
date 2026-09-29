"use client";

import { useEffect, useState } from "react";

export interface CallLimitStatus {
  used: number;
  limit: number;
}

/** "X of 3 calls left today" (SYSTEM-DESIGN.md §9) - shown before a caller ever hits the limit, not just the reactive "limit reached" message. The limit is per account, so the request carries the caller's session token, which agent-server verifies. Refetches after every call ends, via `refreshKey`. */
export function useCallLimit(accessToken: string, refreshKey: unknown): CallLimitStatus | null {
  const [status, setStatus] = useState<CallLimitStatus | null>(null);

  useEffect(() => {
    const url = `${process.env.NEXT_PUBLIC_AGENT_SERVER_URL}/api/limits?access_token=${encodeURIComponent(accessToken)}`;

    let cancelled = false;
    fetch(url)
      .then((res) => (res.ok ? (res.json() as Promise<CallLimitStatus>) : null))
      .then((data) => {
        if (!cancelled && data) setStatus(data);
      })
      .catch(() => undefined); // silent - this is a nice-to-have display, not load-bearing

    return () => {
      cancelled = true;
    };
  }, [accessToken, refreshKey]);

  return status;
}
