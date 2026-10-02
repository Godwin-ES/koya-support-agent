import Link from "next/link";
import { History, Headset, LogIn, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { Wordmark } from "@/components/brand/wordmark";
import { UserAvatar } from "@/components/conversation/avatars";

const NAV = [
  { href: "/", label: "Support", icon: Headset, key: "support" },
  { href: "/history", label: "History", icon: History, key: "history" },
] as const;

export function AppHeader({
  displayName,
  email = null,
  initials,
  onSignOut,
  showSignOut,
  current = "support",
  guest = false,
}: {
  displayName: string | null;
  /** Shown under the name. */
  email?: string | null;
  initials: string;
  onSignOut: () => Promise<void>;
  showSignOut: boolean;
  current?: "support" | "history";
  guest?: boolean;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-[var(--color-surface)]/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Wordmark className="text-xl" />
          <span className="hidden h-5 w-px bg-[var(--color-border)] sm:block" aria-hidden="true" />
          {/* Hidden mid-call, like Sign out: leaving the page would drop the call. */}
          <nav aria-label="App" className={cn("flex items-center gap-1", !showSignOut && "invisible")}>
            {NAV.filter(({ key }) => !guest || key !== "history").map(({ href, label, icon: Icon, key }) => (
              <Link
                key={key}
                href={href}
                aria-current={current === key ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-[var(--radius-md)] px-2.5 py-1.5 text-sm font-medium [transition:background-color_var(--transition-fast),color_var(--transition-fast)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]",
                  current === key ? "bg-[var(--color-accent-soft)] text-[var(--color-accent-hover)]" : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]",
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">{label}</span>
                <span className="sr-only sm:hidden">{label}</span>
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {(displayName || email) && (
            <div className="flex items-center gap-2.5">
              <UserAvatar initials={initials} className="ring-0" />
              <span className="hidden min-w-0 flex-col leading-tight sm:flex">
                <span className="max-w-[220px] truncate text-sm font-medium text-[var(--color-text)]">{displayName ?? email}</span>
                {displayName && email && <span className="max-w-[220px] truncate text-xs text-[var(--color-text-muted)]">{email}</span>}
              </span>
            </div>
          )}
          {guest && showSignOut && (
            <Link href="/sign-in" className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] px-2.5 py-1.5 text-sm font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]">
              <LogIn className="size-4" aria-hidden="true" /> Sign in
            </Link>
          )}
          {!guest && showSignOut && (
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
