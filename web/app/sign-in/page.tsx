"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Wordmark } from "@/components/brand/wordmark";
import { signIn, demoSignIn, type SignInResult } from "./actions";

export default function SignInPage() {
  const [state, formAction, isPending] = useActionState<SignInResult, FormData>(signIn, {});
  const [demoState, demoFormAction, isDemoPending] = useActionState<SignInResult, FormData>(demoSignIn, {});

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-6 px-6">
      <Wordmark />
      <h1 className="text-lg font-semibold text-[var(--color-text)]">Sign in</h1>
      <form action={formAction} className="flex w-full flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm text-[var(--color-text)]">
          Email
          <input type="email" name="email" required autoComplete="email" className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-[var(--color-text)]">
          Password
          <input type="password" name="password" required autoComplete="current-password" className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]" />
        </label>
        {state.error && (
          <p role="alert" className="text-sm text-[var(--color-danger-text)]">
            {state.error}
          </p>
        )}
        <button type="submit" disabled={isPending} aria-busy={isPending} className="mt-2 rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-contrast)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
          {isPending ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="text-sm text-[var(--color-text-muted)]">
        Need an account?{" "}
        <Link href="/sign-up" className="text-[var(--color-accent)] hover:underline">
          Sign up
        </Link>
      </p>

      <div className="w-full rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] p-4 text-center">
        <p className="text-sm font-medium text-[var(--color-text)]">Reviewing this project?</p>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">Skip sign-in with a pre-made demo account.</p>
        <form action={demoFormAction} className="mt-3">
          {demoState.error && (
            <p role="alert" className="mb-2 text-sm text-[var(--color-danger-text)]">
              {demoState.error}
            </p>
          )}
          <button type="submit" disabled={isDemoPending} aria-busy={isDemoPending} className="rounded-[var(--radius-md)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-2)] disabled:cursor-not-allowed disabled:opacity-50">
            {isDemoPending ? "Signing in…" : "Continue as demo reviewer"}
          </button>
        </form>
      </div>
    </main>
  );
}
