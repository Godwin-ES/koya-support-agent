import { Headset } from "lucide-react";
import { cn } from "@/lib/utils";

export function AgentAvatar({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn("grid size-8 shrink-0 place-items-center rounded-full bg-[var(--color-primary)] text-white shadow-[var(--shadow-sm)] ring-2 ring-[var(--color-surface)]", className)}>
      <Headset className="size-4" strokeWidth={2} />
    </span>
  );
}

export function UserAvatar({ initials, className }: { initials: string; className?: string }) {
  return (
    <span aria-hidden="true" className={cn("grid size-8 shrink-0 place-items-center rounded-full bg-[var(--color-accent-soft)] text-xs font-semibold text-[var(--color-accent-hover)] ring-2 ring-[var(--color-surface)]", className)}>
      {initials}
    </span>
  );
}

export function initialsFrom(name: string | null, email: string | null): string {
  const source = name?.trim() || email?.split("@")[0] || "";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  const letters = parts.length >= 2 ? parts[0]![0]! + parts[1]![0]! : source.slice(0, 2);
  return letters.toUpperCase() || "?";
}
