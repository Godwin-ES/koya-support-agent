import { redirect } from "next/navigation";
import { supabaseServerClient } from "@/lib/supabase/server";
import { isStaff } from "@/lib/auth";
import { Wordmark } from "@/components/brand/wordmark";
import { ConsoleNav } from "@/components/console/console-nav";
import { ConsoleBreadcrumb } from "@/components/console/console-breadcrumb";
import { signOut } from "./actions";

/** "A left sidebar (Overview, Conversations, Queue, Evaluations), a top bar with breadcrumb and user menu" (SYSTEM-DESIGN.md §11.2). */
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const supabase = await supabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Defence in depth alongside proxy.ts - a layout that renders console
  // data must never do so for a session that isn't a confirmed staff one
  // (any signed-in account, including a public customer sign-up,
  // otherwise satisfies a bare "is there a user" check).
  if (!isStaff(user)) redirect("/console/sign-in");

  return (
    <div className="flex min-h-screen bg-[var(--color-bg)]">
      <aside aria-label="Console navigation" className="flex w-56 flex-shrink-0 flex-col gap-1 border-r border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-sm)]">
        <div className="mb-4 px-1">
          <Wordmark />
        </div>
        <ConsoleNav />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-3 shadow-[var(--shadow-sm)]">
          <ConsoleBreadcrumb />
          <div className="flex items-center gap-4">
            <span className="text-sm text-[var(--color-text-muted)]">{user.email}</span>
            <form action={signOut}>
              <button type="submit" className="text-sm font-medium text-[var(--color-accent)] [transition:opacity_var(--transition-fast)] hover:opacity-80 hover:underline">
                Sign out
              </button>
            </form>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
