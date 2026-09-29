"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthField } from "@/components/auth/auth-field";
import { FormError, SubmitButton } from "@/components/auth/submit-button";
import { signUp, type SignUpResult } from "./actions";

export default function SignUpPage() {
  const [state, formAction, isPending] = useActionState<SignUpResult, FormData>(signUp, {});

  return (
    <AuthShell title="Create an account" subtitle="It takes less than a minute.">
      <form action={formAction} className="flex flex-col gap-4">
        <AuthField label="Name" type="text" name="name" required autoComplete="name" placeholder="Ada Mensah" />
        <AuthField label="Email" type="email" name="email" required autoComplete="email" placeholder="you@company.com" />
        <AuthField label="Password" type="password" name="password" required autoComplete="new-password" />
        <FormError message={state.error} />
        <SubmitButton pending={isPending} pendingLabel="Creating account…">
          Create account
        </SubmitButton>
      </form>
      <p className="mt-6 text-center text-sm text-[var(--color-text-muted)]">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-medium text-[var(--color-accent)] hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
