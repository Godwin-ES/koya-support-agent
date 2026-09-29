import { listCases } from "@/lib/server/console-data";
import { QueueClient } from "@/components/console/queue-client";

/** "Tickets and escalations in one table with type and status filters... A row opens a side panel whose URL can be linked to" (SYSTEM-DESIGN.md §11.8). */
export default async function QueuePage() {
  const cases = await listCases();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-[var(--color-text)]">Queue</h1>
      <QueueClient initialCases={cases} />
    </div>
  );
}
