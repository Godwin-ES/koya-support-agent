"use client";

import Link from "next/link";
import { useActionState } from "react";
import { UserRound } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthField } from "@/components/auth/auth-field";
import { FormError, SubmitButton } from "@/components/auth/submit-button";
import { signIn, demoSignIn, type SignInResult } from "./actions";

export default function SignInPage() {
  const [state, formAction, isPending] = useActionState<SignInResult, FormData>(signIn, {});
  const [demoState, demoFormAction, isDemoPending] = useActionState<SignInResult, FormData>(demoSignIn, {});

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to talk to RelayPay support.">
      <form action={formAction} className="flex flex-col gap-4">
        <AuthField label="Email" type="email" name="email" required autoComplete="email" placeholder="you@company.com" />
        <AuthField label="Password" type="password" name="password" required autoComplete="current-password" />
        <FormError message={state.error} />
        <SubmitButton pending={isPending} pendingLabel="Signing in…">
          Sign in
        </SubmitButton>
      </form>

      <div className="my-5 flex items-center gap-3" aria-hidden="true">
        <div className="h-px flex-1 bg-[var(--color-border)]" />
        <span className="text-xs text-[var(--color-text-muted)]">or</span>
        <div className="h-px flex-1 bg-[var(--color-border)]" />
      </div>

      <form action={demoFormAction} className="flex flex-col gap-3">
        <FormError message={demoState.error} />
        <SubmitButton pending={isDemoPending} pendingLabel="Signing in…" variant="secondary" icon={<UserRound className="size-4" aria-hidden="true" />}>
          Sign in with demo account
        </SubmitButton>
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
