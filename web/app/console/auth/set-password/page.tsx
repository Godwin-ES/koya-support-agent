"use client";

import { useActionState } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthField } from "@/components/auth/auth-field";
import { FormError, SubmitButton } from "@/components/auth/submit-button";
import { setPassword, type SetPasswordResult } from "./actions";

export default function SetPasswordPage() {
  const [state, formAction, isPending] = useActionState<SetPasswordResult, FormData>(setPassword, {});

  return (
    <AuthShell title="Finish setting up your account" subtitle="You'll use it to sign in to the support console and the customer app." audience="staff">
      <form action={formAction} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AuthField label="First name" type="text" name="first_name" required autoComplete="given-name" />
          <AuthField label="Last name" type="text" name="last_name" required autoComplete="family-name" />
        </div>
        <AuthField label="Password" type="password" name="password" required minLength={8} autoComplete="new-password" />
        <FormError message={state.error} />
        <SubmitButton pending={isPending} pendingLabel="Saving…">
          Save and continue
        </SubmitButton>
      </form>
    </AuthShell>
  );
}
