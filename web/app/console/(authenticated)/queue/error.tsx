"use client";

import { ErrorState } from "@/components/primitives/async-state";

export default function Error({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-[var(--color-text)]">Queue</h1>
      <ErrorState message="Couldn't load the queue." onRetry={retry} />
    </div>
  );
}
