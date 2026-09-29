import { cn } from "@/lib/utils";

/**
 * The RelayPay wordmark (brand-direction.md: "Do not animate or
 * over-style the logo"). Plain text, not an image - the brand direction
 * gives no logo asset, just placement and restraint rules, and a styled
 * wordmark keeps the bundle free of a logo file to source or license.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("select-none text-lg font-semibold tracking-tight text-[var(--color-primary)]", className)}>
      Relay<span className="text-[var(--color-accent)]">Pay</span>
    </span>
  );
}
