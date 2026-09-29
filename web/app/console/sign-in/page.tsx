"use client";

import { useActionState } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthField } from "@/components/auth/auth-field";
import { FormError, SubmitButton } from "@/components/auth/submit-button";
import { signIn, type SignInResult } from "./actions";

export default function SignInPage() {
  const [state, formAction, isPending] = useActionState<SignInResult, FormData>(signIn, {});

  return (
    <AuthShell title="Staff sign in" subtitle="For RelayPay support staff." audience="staff">
      <form action={formAction} className="flex flex-col gap-4">
        <AuthField label="Email" type="email" name="email" required autoComplete="email" />
        <AuthField label="Password" type="password" name="password" required autoComplete="current-password" />
        <FormError message={state.error} />
        <SubmitButton pending={isPending} pendingLabel="Signing in…">
          Sign in
        </SubmitButton>
      </form>
    </AuthShell>
  );
}
