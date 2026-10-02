"use client";

import { useActionState, useState } from "react";
import { ChevronRight, Loader2 } from "lucide-react";
import { SAMPLE_CUSTOMERS } from "@/lib/sample-customers";
import { UserAvatar, initialsFrom } from "@/components/conversation/avatars";
import { cn } from "@/lib/utils";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthField } from "@/components/auth/auth-field";
import { FormError, SubmitButton } from "@/components/auth/submit-button";
import { signIn, sampleCustomerSignIn, type SignInResult } from "./actions";
import Link from "next/link";

const TONE: Record<(typeof SAMPLE_CUSTOMERS)[number]["tone"], string> = {
  success: "bg-[var(--color-success-bg)] text-[var(--color-success-text)]",
  warning: "bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]",
  danger: "bg-[var(--color-danger-bg)] text-[var(--color-danger-text)]",
};

export default function SignInPage() {
  const [state, formAction, isPending] = useActionState<SignInResult, FormData>(signIn, {});
  const [sampleState, sampleFormAction, isSamplePending] = useActionState<SignInResult, FormData>(sampleCustomerSignIn, {});
  const [chosen, setChosen] = useState<string | null>(null);

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
        <span className="text-xs text-[var(--color-text-muted)]">or try it out</span>
        <div className="h-px flex-1 bg-[var(--color-border)]" />
      </div>

      <section aria-labelledby="sample-customers-heading">
        <h2 id="sample-customers-heading" className="text-sm font-semibold text-[var(--color-text)]">
          Sign in as a sample customer
        </h2>
        <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">Each sees only their own account, transactions and payouts.</p>
        <form action={sampleFormAction} onSubmit={(e) => setChosen(((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value ?? null)} className="mt-3">
          <ul className="divide-y divide-[var(--color-border)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)]">
            {SAMPLE_CUSTOMERS.map((c) => (
              <li key={c.customerId}>
                <button
                  type="submit"
                  name="customer_id"
                  value={c.customerId}
                  disabled={isSamplePending}
                  aria-label={`Sign in as ${c.name}`}
                  className="group flex w-full items-center gap-3 px-3 py-2.5 text-left [transition:background-color_var(--transition-fast)] hover:bg-[var(--color-surface-2)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <UserAvatar initials={initialsFrom(c.name, null)} className="ring-0" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--color-text)]">{c.name}</span>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", TONE[c.tone])}>{c.status}</span>
                  {isSamplePending && chosen === c.customerId ? (
                    <Loader2 className="size-4 shrink-0 animate-spin text-[var(--color-text-muted)]" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="size-4 shrink-0 text-[var(--color-text-muted)] [transition:transform_var(--transition-fast)] group-hover:translate-x-0.5" aria-hidden="true" />
                  )}
                </button>
              </li>
            ))}
          </ul>
          <FormError message={sampleState.error} className="mt-2" />
        </form>
      </section>

      <p className="mt-6 text-center text-sm text-[var(--color-text-muted)]">Access is by invitation. Check your email for an invite link.</p>
      <Link href="/" className="mt-3 block text-center text-sm font-semibold text-[var(--color-accent)] hover:underline">Continue as guest</Link>
    </AuthShell>
  );
}
