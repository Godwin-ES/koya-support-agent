"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
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
    <AuthShell title="Finishing your invite">
      {error ? (
        <p role="alert" className="text-center text-sm text-[var(--color-danger-text)]">
          That invite link is missing or expired. Ask for a new one, or{" "}
          <a href="/sign-in" className="font-medium text-[var(--color-accent)] hover:underline">
            sign in
          </a>
          .
        </p>
      ) : (
        <p role="status" className="flex items-center justify-center gap-2 text-sm text-[var(--color-text-muted)]">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          Signing you in…
        </p>
      )}
    </AuthShell>
  );
}
