"use client";

import { ErrorState } from "@/components/primitives/async-state";

/** The default error boundary for any authenticated console page without its own more specific one (SYSTEM-DESIGN.md §11.3) - overview and evaluations use this; conversations and queue override it with a page-specific message. */
export default function Error({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <ErrorState message="Something went wrong loading this page." onRetry={retry} />
    </div>
  );
}
