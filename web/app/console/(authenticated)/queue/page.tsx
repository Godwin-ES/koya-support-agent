import { listCases, parseSource } from "@/lib/server/console-data";
import { QueueClient } from "@/components/console/queue-client";
import { SourceTabs } from "@/components/console/source-tabs";

/** "Tickets and escalations in one table with type and status filters... A row opens a side panel whose URL can be linked to" (SYSTEM-DESIGN.md §11.8). */
export default async function QueuePage({ searchParams }: { searchParams: Promise<{ source?: string }> }) {
  const source = parseSource((await searchParams).source);
  const cases = await listCases({ source });
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-[var(--color-text)]">Queue</h1>
      <SourceTabs basePath="/console/queue" current={source} />
      <QueueClient key={source} initialCases={cases} />
    </div>
  );
}
