"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/console", label: "Overview" },
  { href: "/console/conversations", label: "Conversations" },
  { href: "/console/queue", label: "Queue" },
  { href: "/console/evaluations", label: "Evaluations" },
] as const;

/** The sidebar's own current-page indicator - missing entirely before (SYSTEM-DESIGN.md §11.2 implies it, "a left sidebar," but nothing marked which section you're in). A left accent border, not color alone (§11.10). */
export function ConsoleNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Console" className="flex flex-col gap-1">
      {NAV.map((item) => {
        const isActive = item.href === "/console" ? pathname === "/console" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "rounded-[var(--radius-sm)] border-l-2 px-3 py-2 text-sm font-medium [transition:background-color_var(--transition-fast),border-color_var(--transition-fast),color_var(--transition-fast)]",
              isActive ? "border-[var(--color-accent)] bg-[var(--color-surface-2)] text-[var(--color-text)]" : "border-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
