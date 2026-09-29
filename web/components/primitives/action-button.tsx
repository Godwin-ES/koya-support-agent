"use client";

import { forwardRef, useEffect, useId, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { ActionState } from "@core/domain/action-state";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "./confirm-dialog";

const PENDING_LABEL_DELAY_MS = 400;
const PROGRESSIVE_FEEDBACK_DELAY_MS = 10_000;

export interface ActionButtonProps {
  /** Receives a stable-per-intent idempotency key. May throw or reject. */
  action: (idempotencyKey: string) => Promise<void> | void;
  idleLabel: string;
  pendingLabel?: string;
  /** From a derive*Actions function (SYSTEM-DESIGN.md §11.5). Omit for a plain, always-enabled button. */
  state?: ActionState;
  onError?: (error: unknown) => void;
  onSuccess?: () => void;
  /** Requires an explicit confirmation dialog before running the action (SYSTEM-DESIGN.md §11.4). */
  confirm?: { title: string; description: string; confirmLabel?: string; destructive?: boolean };
  variant?: "primary" | "secondary" | "danger" | "ghost";
  className?: string;
  /** A stable identifier for tests, independent of the visible label (which changes with `state.label`, e.g. "Start call" -> "Connecting…"). */
  "data-testid"?: string;
}

// Shadow + a 1px hover lift on the two "does something" variants (primary,
// danger) gives them real weight without any new color - restrained on
// purpose (brand-direction.md: "avoid anything playful, flashy"). Ghost
// and secondary stay flat; they're deliberately the quieter choice.
const VARIANT_CLASSES: Record<NonNullable<ActionButtonProps["variant"]>, string> = {
  primary: "bg-[var(--color-accent)] text-[var(--color-accent-contrast)] shadow-[var(--shadow-sm)] hover:bg-[var(--color-accent-hover)] hover:shadow-[var(--shadow-md)] hover:-translate-y-px active:translate-y-0 active:shadow-[var(--shadow-sm)]",
  secondary: "border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text)] hover:bg-[var(--color-surface-3)]",
  danger: "bg-[var(--color-danger-text)] text-white shadow-[var(--shadow-sm)] hover:opacity-90 hover:shadow-[var(--shadow-md)] hover:-translate-y-px active:translate-y-0 active:shadow-[var(--shadow-sm)]",
  ghost: "bg-transparent text-[var(--color-text)] hover:bg-[var(--color-surface-2)]",
};

/**
 * The only way any page performs a mutation (SYSTEM-DESIGN.md §11.4) - the
 * no-double-click rule is enforced once here, not remembered per button.
 * Owns: idle -> pending -> settled, the 400ms no-flash threshold on the
 * pending *label*, the 10-second progressive-feedback message, a
 * synchronous (ref-based, not state-based) double-submit guard, a stable
 * idempotency key across retries of one intent, the visible
 * disabled-reason tooltip (plus `aria-describedby`), and confirmation.
 */
export const ActionButton = forwardRef<HTMLButtonElement, ActionButtonProps>(function ActionButton({ action, idleLabel, pendingLabel, state, onError, onSuccess, confirm, variant = "primary", className, "data-testid": dataTestId }, forwardedRef) {
  const [isPending, setIsPending] = useState(false);
  const [showPendingLabel, setShowPendingLabel] = useState(false);
  const [showProgressiveFeedback, setShowProgressiveFeedback] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // The ref guard is the real defence against a double click: checked and
  // set synchronously, in the same tick as the click handler, before any
  // React state update (and its re-render) could land. `isPending` state
  // exists for rendering (disabled attribute, aria-busy), not correctness.
  const submittingRef = useRef(false);
  const idempotencyKeyRef = useRef<string | null>(null);
  const pendingLabelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressiveFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const descriptionId = useId();

  useEffect(
    () => () => {
      if (pendingLabelTimerRef.current) clearTimeout(pendingLabelTimerRef.current);
      if (progressiveFeedbackTimerRef.current) clearTimeout(progressiveFeedbackTimerRef.current);
    },
    [],
  );

  if (state?.kind === "hidden") return null;

  const disabledByState = state?.kind === "disabled";
  const disabledReason = state?.kind === "disabled" ? state.reason : undefined;
  const isDisabled = disabledByState || isPending;
  const stateLabel = state?.kind === "enabled" || state?.kind === "disabled" ? state.label : undefined;

  function getIdempotencyKey(): string {
    if (!idempotencyKeyRef.current) idempotencyKeyRef.current = crypto.randomUUID();
    return idempotencyKeyRef.current;
  }

  async function run() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsPending(true);

    pendingLabelTimerRef.current = setTimeout(() => setShowPendingLabel(true), PENDING_LABEL_DELAY_MS);
    progressiveFeedbackTimerRef.current = setTimeout(() => setShowProgressiveFeedback(true), PROGRESSIVE_FEEDBACK_DELAY_MS);

    try {
      await action(getIdempotencyKey());
      // A successful action fulfils its intent - the next click (if the
      // button is still mounted and enabled) is a new one.
      idempotencyKeyRef.current = null;
      onSuccess?.();
    } catch (error) {
      // Deliberately keep idempotencyKeyRef as-is: a retry of a failed
      // action is the same intent, and the server can recognise it as
      // the same request if the first attempt actually landed.
      onError?.(error);
    } finally {
      if (pendingLabelTimerRef.current) clearTimeout(pendingLabelTimerRef.current);
      if (progressiveFeedbackTimerRef.current) clearTimeout(progressiveFeedbackTimerRef.current);
      submittingRef.current = false;
      setIsPending(false);
      setShowPendingLabel(false);
      setShowProgressiveFeedback(false);
    }
  }

  function handleClick() {
    if (submittingRef.current || isDisabled) return;
    if (confirm) {
      setConfirmOpen(true);
      return;
    }
    void run();
  }

  const label = showPendingLabel && pendingLabel ? pendingLabel : (stateLabel ?? idleLabel);

  return (
    <>
      <button
        ref={forwardedRef}
        type="button"
        onClick={handleClick}
        disabled={isDisabled}
        aria-busy={isPending}
        aria-describedby={disabledReason ? descriptionId : undefined}
        title={disabledReason}
        data-testid={dataTestId}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] px-4 py-2 text-sm font-medium",
          "[transition-property:background-color,box-shadow,transform,opacity] [transition-duration:var(--transition-fast)]",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]",
          "disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none",
          VARIANT_CLASSES[variant],
          className,
        )}
      >
        {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        <span>{label}</span>
      </button>
      {disabledReason && (
        <span id={descriptionId} className="sr-only">
          {disabledReason}
        </span>
      )}
      {showProgressiveFeedback && (
        <p role="status" aria-live="polite" className="mt-2 text-xs text-[var(--color-text-muted)]">
          Still working, this can take a few seconds.
        </p>
      )}
      {confirm && (
        <ConfirmDialog
          open={confirmOpen}
          title={confirm.title}
          description={confirm.description}
          confirmLabel={confirm.confirmLabel ?? "Confirm"}
          destructive={confirm.destructive}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => {
            setConfirmOpen(false);
            void run();
          }}
        />
      )}
    </>
  );
});
