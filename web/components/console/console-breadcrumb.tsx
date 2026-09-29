"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

// Static labels for known sections; a dynamic [id]/[runId] segment gets a
// fixed generic label rather than fetching the entity just for a
// breadcrumb (SYSTEM-DESIGN.md §11.2 asks for "a top bar with
// breadcrumb," not a data-driven one).
const SEGMENT_LABELS: Record<string, string> = {
  console: "Console",
  conversations: "Conversations",
  queue: "Queue",
  evaluations: "Evaluations",
};

function labelFor(segment: string, parent: string | undefined): string {
  if (SEGMENT_LABELS[segment]) return SEGMENT_LABELS[segment];
  if (parent === "conversations") return "Conversation";
  if (parent === "evaluations") return "Run";
  return segment;
}

/** "A top bar with breadcrumb and user menu" (SYSTEM-DESIGN.md §11.2) - specified, never built until now. */
export function ConsoleBreadcrumb() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean); // e.g. ["console", "conversations", "abc123"]

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-[var(--color-text-muted)]">
      {segments.map((segment, i) => {
        const href = "/" + segments.slice(0, i + 1).join("/");
        const isLast = i === segments.length - 1;
        const label = labelFor(segment, segments[i - 1]);
        return (
          <span key={href} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />}
            {isLast ? (
              <span className="font-medium text-[var(--color-text)]" aria-current="page">
                {label}
              </span>
            ) : (
              <Link href={href} className="hover:text-[var(--color-text)] hover:underline">
                {label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
