import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const VARIANTS = {
  primary: "bg-[var(--color-accent)] text-[var(--color-accent-contrast)] shadow-[var(--shadow-sm)] hover:-translate-y-px hover:bg-[var(--color-accent-hover)] hover:shadow-[var(--shadow-accent)]",
  secondary: "border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] shadow-[var(--shadow-sm)] hover:border-[var(--color-text-muted)]/40 hover:bg-[var(--color-surface-2)]",
};

/** Form submit for the auth pages - these submit a server action via `useActionState`, so they aren't ActionButtons. */
export function SubmitButton({ pending, pendingLabel, children, variant = "primary", icon }: { pending: boolean; pendingLabel: string; children: ReactNode; variant?: keyof typeof VARIANTS; icon?: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={cn(
        "inline-flex h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-lg)] px-4 text-[15px] font-medium",
        "[transition-property:background-color,border-color,box-shadow,transform] [transition-duration:var(--transition-fast)] active:translate-y-0",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]",
        "disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none",
        VARIANTS[variant],
      )}
    >
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : icon}
      {pending ? pendingLabel : children}
    </button>
  );
}

export function FormError({ message, className }: { message?: string; className?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className={cn("rounded-[var(--radius-md)] border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-3 py-2 text-sm text-[var(--color-danger-text)]", className)}>
      {message}
    </p>
  );
}
