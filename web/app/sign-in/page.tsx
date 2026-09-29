"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthField } from "@/components/auth/auth-field";
import { signIn, demoSignIn, type SignInResult } from "./actions";

const SUBMIT_CLASSES =
  "inline-flex w-full items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-[var(--color-accent-contrast)] shadow-[var(--shadow-sm)] [transition:background-color_var(--transition-fast),box-shadow_var(--transition-fast),transform_var(--transition-fast)] hover:-translate-y-px hover:bg-[var(--color-accent-hover)] hover:shadow-[var(--shadow-md)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none";

export default function SignInPage() {
  const [state, formAction, isPending] = useActionState<SignInResult, FormData>(signIn, {});
  const [demoState, demoFormAction, isDemoPending] = useActionState<SignInResult, FormData>(demoSignIn, {});

  return (
    <AuthShell title="Sign in">
      <form action={formAction} className="flex flex-col gap-4">
        <AuthField label="Email" type="email" name="email" required autoComplete="email" />
        <AuthField label="Password" type="password" name="password" required autoComplete="current-password" />
        {state.error && (
          <p role="alert" className="text-sm text-[var(--color-danger-text)]">
            {state.error}
          </p>
        )}
        <button type="submit" disabled={isPending} aria-busy={isPending} className={SUBMIT_CLASSES}>
          {isPending ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <div className="my-5 flex items-center gap-3" aria-hidden="true">
        <div className="h-px flex-1 bg-[var(--color-border)]" />
        <span className="text-xs text-[var(--color-text-muted)]">or</span>
        <div className="h-px flex-1 bg-[var(--color-border)]" />
      </div>

      <form action={demoFormAction}>
        {demoState.error && (
          <p role="alert" className="mb-2 text-sm text-[var(--color-danger-text)]">
            {demoState.error}
          </p>
        )}
        <button
          type="submit"
          disabled={isDemoPending}
          aria-busy={isDemoPending}
          className="inline-flex w-full items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm font-medium text-[var(--color-text)] [transition:background-color_var(--transition-fast)] hover:bg-[var(--color-surface-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isDemoPending ? "Signing in…" : "Sign in with demo account"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-[var(--color-text-muted)]">
        Need an account?{" "}
        <Link href="/sign-up" className="font-medium text-[var(--color-accent)] hover:underline">
          Sign up
        </Link>
      </p>
    </AuthShell>
  );
}
