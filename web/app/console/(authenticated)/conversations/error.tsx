"use client";

import { ErrorState } from "@/components/primitives/async-state";

/** "What failed, why, and what to do next, with Retry" (SYSTEM-DESIGN.md §11.3) - Next.js's own error boundary convention, `reset()` is the Retry. */
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-[var(--color-text)]">Conversations</h1>
      <ErrorState message="Couldn't load conversations." onRetry={reset} />
    </div>
  );
}
