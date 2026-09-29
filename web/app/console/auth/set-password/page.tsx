"use client";

import { useActionState } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthField } from "@/components/auth/auth-field";
import { FormError, SubmitButton } from "@/components/auth/submit-button";
import { setPassword, type SetPasswordResult } from "./actions";

export default function SetPasswordPage() {
  const [state, formAction, isPending] = useActionState<SetPasswordResult, FormData>(setPassword, {});

  return (
    <AuthShell title="Set your password" subtitle="You'll use it to sign in to the console." audience="staff">
      <form action={formAction} className="flex flex-col gap-4">
        <AuthField label="Password" type="password" name="password" required autoComplete="new-password" />
        <FormError message={state.error} />
        <SubmitButton pending={isPending} pendingLabel="Saving…">
          Save password
        </SubmitButton>
      </form>
    </AuthShell>
  );
}
