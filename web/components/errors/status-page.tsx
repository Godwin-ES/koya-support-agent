import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Wordmark } from "@/components/brand/wordmark";

/** The shared frame for the app's error and not-found pages - on brand, one clear message, and a way forward. */
export function StatusPage({ icon: Icon, title, message, children }: { icon: LucideIcon; title: string; message: string; children: ReactNode }) {
  return (
    <main className="bg-dot-grid flex min-h-dvh items-center justify-center px-5 py-12">
      <div className="w-full max-w-md text-center">
        <Wordmark className="text-xl" />
        <div className="mt-8 rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-10 shadow-[var(--shadow-lg)] sm:px-10">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <h1 className="mt-5 text-xl font-semibold tracking-tight text-[var(--color-text)]">{title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-muted)]">{message}</p>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">{children}</div>
        </div>
      </div>
    </main>
  );
}

export const PRIMARY_ACTION =
  "inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-accent)] px-5 py-2.5 text-sm font-medium text-white shadow-[var(--shadow-sm)] [transition:background-color_var(--transition-fast)] hover:bg-[var(--color-accent-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]";
export const SECONDARY_ACTION =
  "inline-flex items-center justify-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-2.5 text-sm font-medium text-[var(--color-text)] [transition:background-color_var(--transition-fast)] hover:bg-[var(--color-surface-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]";
