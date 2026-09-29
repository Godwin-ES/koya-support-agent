import { Skeleton } from "@/components/primitives/async-state";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      {/* Matches the page's real h1 text, so a screen reader landing mid-load still gets a real level-one heading (Task 14 audit: axe's page-has-heading-one). */}
      <h1 className="sr-only">Queue</h1>
      <Skeleton className="h-6 w-24" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
