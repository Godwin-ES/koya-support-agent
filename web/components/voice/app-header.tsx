import { LogOut } from "lucide-react";
import { Wordmark } from "@/components/brand/wordmark";
import { UserAvatar } from "@/components/conversation/avatars";

export function AppHeader({ displayName, initials, onSignOut, showSignOut }: { displayName: string | null; initials: string; onSignOut: () => Promise<void>; showSignOut: boolean }) {
  return (
    <header className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-[var(--color-surface)]/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Wordmark className="text-xl" />
          <span className="hidden h-5 w-px bg-[var(--color-border)] sm:block" aria-hidden="true" />
          <span className="hidden text-sm font-medium text-[var(--color-text-muted)] sm:block">Support</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {displayName && (
            <div className="flex items-center gap-2.5">
              <UserAvatar initials={initials} className="ring-0" />
              <span className="hidden max-w-[180px] truncate text-sm font-medium text-[var(--color-text)] sm:block">{displayName}</span>
            </div>
          )}
          {showSignOut && (
            <form action={onSignOut}>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] px-2.5 py-1.5 text-sm font-medium text-[var(--color-text-muted)] [transition:background-color_var(--transition-fast),color_var(--transition-fast)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
              >
                <LogOut className="size-4" aria-hidden="true" />
                Sign out
              </button>
            </form>
          )}
        </div>
      </div>
    </header>
  );
}
