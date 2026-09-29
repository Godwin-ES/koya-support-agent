"use client";

import { useEffect, useState } from "react";
import { Wordmark } from "@/components/brand/wordmark";
import { completeInvite } from "./actions";

/**
 * Completes a Supabase invite-email redirect. Confirmed against a real
 * live invite link (Task 13/14, not assumed from docs): Supabase's
 * project sends the session as a URL hash fragment
 * (`#access_token=...&refresh_token=...&type=invite`), the implicit
 * flow - not a `?code=` PKCE flow. A hash fragment never reaches the
 * server (browsers strip it before sending the request), so this has to
 * be a client component reading `window.location.hash`, then handing the
 * tokens to a server action (`completeInvite`) to establish the session
 * as cookies. `proxy.ts` excludes `/console/auth/*` from its sign-in
 * gate, since this page's whole job runs with no session yet.
 */
export default function ConsoleAuthCallbackPage() {
  const [error, setError] = useState(false);

  useEffect(() => {
    const run = () => {
      const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      if (!accessToken || !refreshToken) {
        setError(true);
        return;
      }
      void completeInvite(accessToken, refreshToken);
    };
    run();
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
      <Wordmark />
      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger-text)]">
          That invite link is missing or expired. Ask for a new one, or{" "}
          <a href="/console/sign-in" className="text-[var(--color-accent)] hover:underline">
            sign in
          </a>
          .
        </p>
      ) : (
        <p className="text-sm text-[var(--color-text-muted)]">Signing you in…</p>
      )}
    </main>
  );
}
