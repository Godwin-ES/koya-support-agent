import { WifiOff } from "lucide-react";

/**
 * SYSTEM-DESIGN.md §11.6: "Connection loss: a persistent 'Reconnecting…'
 * banner, falling back to polling. On reconnect it refetches from scratch,
 * rather than assuming nothing was missed." Rendered whenever the caller
 * knows the connection is down - it holds no reconnect logic itself.
 */
export function ReconnectingBanner() {
  return (
    <div role="status" aria-live="polite" className="flex items-center justify-center gap-2 bg-[var(--color-warning-bg)] px-4 py-2 text-sm text-[var(--color-warning-text)]">
      <WifiOff className="h-4 w-4" aria-hidden="true" />
      Reconnecting…
    </div>
  );
}
