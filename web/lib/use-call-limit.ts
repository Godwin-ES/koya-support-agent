"use client";

import { useEffect, useState } from "react";

const BROWSER_ID_STORAGE_KEY = "relaypay_browser_id";

// Duplicated from use-voice-call.ts/use-text-chat.ts deliberately - this
// hook only needs to read the id, not own its lifecycle, and it must use
// the exact same key those two already write to.
function getBrowserId(): string | null {
  try {
    return localStorage.getItem(BROWSER_ID_STORAGE_KEY);
  } catch {
    return null;
  }
}

export interface CallLimitStatus {
  used: number;
  limit: number;
}

/** "X of 3 calls used today" (SYSTEM-DESIGN.md §9) - shown before a caller ever hits the limit, not just the reactive "limit reached" message. Refetches after every call ends, via `refreshKey`. */
export function useCallLimit(refreshKey: unknown): CallLimitStatus | null {
  const [status, setStatus] = useState<CallLimitStatus | null>(null);

  useEffect(() => {
    const browserId = getBrowserId();
    const query = browserId ? `?browser_id=${encodeURIComponent(browserId)}` : "";
    const url = `${process.env.NEXT_PUBLIC_AGENT_SERVER_URL}/api/limits${query}`;

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
  }, [refreshKey]);

  return status;
}
