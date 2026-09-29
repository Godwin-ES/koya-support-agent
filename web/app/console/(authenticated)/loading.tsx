import { Skeleton } from "@/components/primitives/async-state";

/**
 * The default skeleton for any authenticated console page without its own
 * more specific one (SYSTEM-DESIGN.md §11.3) - overview and evaluations use
 * this; conversations and queue override it with list-shaped skeletons.
 * Overview and evaluations share one title bar shape, so this uses a
 * generic sr-only heading rather than either page's real title - a screen
 * reader hitting this state mid-load still lands on a level-one heading
 * (Task 14 audit: axe's page-has-heading-one caught the skeleton having
 * none at all).
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">Loading</h1>
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
