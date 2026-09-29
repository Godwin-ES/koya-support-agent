"use client";

import { useActionState } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthField } from "@/components/auth/auth-field";
import { setPassword, type SetPasswordResult } from "./actions";

export default function SetPasswordPage() {
  const [state, formAction, isPending] = useActionState<SetPasswordResult, FormData>(setPassword, {});

  return (
    <AuthShell title="Set your password">
      <form action={formAction} className="flex flex-col gap-4">
        <AuthField label="Password" type="password" name="password" required autoComplete="new-password" />
        {state.error && (
          <p role="alert" className="text-sm text-[var(--color-danger-text)]">
            {state.error}
          </p>
        )}
        <button
          type="submit"
          disabled={isPending}
          aria-busy={isPending}
          className="inline-flex w-full items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-[var(--color-accent-contrast)] shadow-[var(--shadow-sm)] [transition:background-color_var(--transition-fast),box-shadow_var(--transition-fast),transform_var(--transition-fast)] hover:-translate-y-px hover:bg-[var(--color-accent-hover)] hover:shadow-[var(--shadow-md)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
        >
          {isPending ? "Saving…" : "Save password"}
        </button>
      </form>
    </AuthShell>
  );
}
