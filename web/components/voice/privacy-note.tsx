import { ShieldCheck } from "lucide-react";

/** "Always visible" (SYSTEM-DESIGN.md §11.7) - literal wording from the design doc. */
export function PrivacyNote() {
  return (
    <p className="flex items-start justify-center gap-2 text-center text-xs leading-relaxed text-[var(--color-text-muted)]">
      <ShieldCheck className="mt-px size-4 shrink-0 text-[var(--color-accent)]" aria-hidden="true" />
      <span>Calls are transcribed so our team can review and improve support. Please don&apos;t share card numbers or passwords.</span>
    </p>
  );
}
