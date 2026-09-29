/** "Always visible" (SYSTEM-DESIGN.md §11.7) - literal wording from the design doc. */
export function PrivacyNote() {
  return <p className="max-w-md text-center text-xs text-[var(--color-text-muted)]">Calls are transcribed so our team can review and improve support. Please don&apos;t share card numbers or passwords.</p>;
}
