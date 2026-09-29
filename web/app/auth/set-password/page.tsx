"use client";

import { useActionState } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthField } from "@/components/auth/auth-field";
import { FormError, SubmitButton } from "@/components/auth/submit-button";
import { setPassword, type SetPasswordResult } from "./actions";

export default function CustomerSetPasswordPage() {
  const [state, formAction, isPending] = useActionState<SetPasswordResult, FormData>(setPassword, {});

  return (
    <AuthShell title="Welcome to RelayPay Support" subtitle="Choose a password to finish setting up your account.">
      <form action={formAction} className="flex flex-col gap-4">
        <AuthField label="Password" type="password" name="password" required minLength={8} autoComplete="new-password" />
        <FormError message={state.error} />
        <SubmitButton pending={isPending} pendingLabel="Saving…">
          Save and continue
        </SubmitButton>
      </form>
    </AuthShell>
  );
}
