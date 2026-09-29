import type { ReactNode } from "react";
import { Wordmark } from "@/components/brand/wordmark";

/**
 * The shared frame for every single-screen auth flow (sign-in, sign-up,
 * console sign-in, invite set-password, the invite callback's own
 * loading/error states) - one card treatment instead of five near-
 * duplicate bare forms, and the logo centred at the top exactly as
 * brand-direction.md specifies for a single-screen flow.
 */
export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-1 pb-8">
          <Wordmark className="text-xl" />
          <h1 className="text-lg font-semibold text-[var(--color-text)]">{title}</h1>
        </div>
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)] sm:p-8">{children}</div>
      </div>
    </main>
  );
}
