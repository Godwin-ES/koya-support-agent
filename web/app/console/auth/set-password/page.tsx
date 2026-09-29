"use client";

import { useActionState } from "react";
import { Wordmark } from "@/components/brand/wordmark";
import { setPassword, type SetPasswordResult } from "./actions";

export default function SetPasswordPage() {
  const [state, formAction, isPending] = useActionState<SetPasswordResult, FormData>(setPassword, {});

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-6 px-6">
      <Wordmark />
      <h1 className="text-lg font-semibold text-[var(--color-text)]">Set your password</h1>
      <form action={formAction} className="flex w-full flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm text-[var(--color-text)]">
          Password
          <input
            type="password"
            name="password"
            required
            autoComplete="new-password"
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          />
        </label>
        {state.error && (
          <p role="alert" className="text-sm text-[var(--color-danger-text)]">
            {state.error}
          </p>
        )}
        <button type="submit" disabled={isPending} aria-busy={isPending} className="mt-2 rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-contrast)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
          {isPending ? "Saving…" : "Save password"}
        </button>
      </form>
    </main>
  );
}
