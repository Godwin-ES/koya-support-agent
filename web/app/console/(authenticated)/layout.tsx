import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServerClient } from "@/lib/supabase/server";
import { Wordmark } from "@/components/brand/wordmark";
import { signOut } from "./actions";

const NAV = [
  { href: "/console", label: "Overview" },
  { href: "/console/conversations", label: "Conversations" },
  { href: "/console/queue", label: "Queue" },
  { href: "/console/evaluations", label: "Evaluations" },
];

/** "A left sidebar (Overview, Conversations, Queue, Evaluations), a top bar with breadcrumb and user menu" (SYSTEM-DESIGN.md §11.2). */
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const supabase = await supabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Defence in depth alongside middleware.ts - a layout that renders
  // console data must never do so without a confirmed session.
  if (!user) redirect("/console/sign-in");

  return (
    <div className="flex min-h-screen">
      <aside aria-label="Console navigation" className="flex w-56 flex-shrink-0 flex-col gap-1 border-r border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="mb-4">
          <Wordmark />
        </div>
        <nav aria-label="Console" className="flex flex-col gap-1">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="rounded-[var(--radius-sm)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-2)]">
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-3">
          <span className="text-sm text-[var(--color-text-muted)]">{user.email}</span>
          <form action={signOut}>
            <button type="submit" className="text-sm font-medium text-[var(--color-accent)] hover:underline">
              Sign out
            </button>
          </form>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
