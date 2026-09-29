import Link from "next/link";
import { ANSWER_PATH } from "@core/domain/status";
import { listConversations } from "@/lib/server/console-data";
import { StatusBadge } from "@/components/primitives/status-badge";
import { EmptyState } from "@/components/primitives/async-state";

/** "Started, channel, duration, paths taken, outcome, escalated or ticketed, cost" (SYSTEM-DESIGN.md §11.1, §11.8). */
export default async function ConversationsPage({ searchParams }: { searchParams: Promise<{ channel?: string; escalated?: string }> }) {
  const params = await searchParams;
  const conversations = await listConversations({ channel: params.channel, escalated: params.escalated === "true" ? true : undefined });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-[var(--color-text)]">Conversations</h1>
      <p className="text-sm text-[var(--color-text-muted)]">{conversations.length} result{conversations.length === 1 ? "" : "s"}</p>

      {conversations.length === 0 ? (
        <EmptyState message="No conversations yet. New calls and text sessions appear here as they happen." />
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)]">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-[var(--color-surface-2)] text-left text-xs font-medium tracking-wide text-[var(--color-text-muted)]">
              <tr>
                <th className="border-b border-[var(--color-border)] px-4 py-2.5">Started</th>
                <th className="border-b border-[var(--color-border)] px-4 py-2.5">Channel</th>
                <th className="border-b border-[var(--color-border)] px-4 py-2.5">Duration</th>
                <th className="border-b border-[var(--color-border)] px-4 py-2.5">Paths taken</th>
                <th className="border-b border-[var(--color-border)] px-4 py-2.5">Outcome</th>
                <th className="border-b border-[var(--color-border)] px-4 py-2.5">Cost</th>
              </tr>
            </thead>
            <tbody>
              {conversations.map((c) => {
                const durationSeconds = c.ended_at ? Math.round((new Date(c.ended_at).getTime() - new Date(c.started_at).getTime()) / 1000) : null;
                return (
                  <tr key={c.id} className="[transition:background-color_var(--transition-fast)] hover:bg-[var(--color-surface-hover)]">
                    <td className="border-b border-[var(--color-border)] px-4 py-2.5">
                      <Link href={`/console/conversations/${c.id}`} className="font-medium text-[var(--color-accent)] hover:underline">
                        {new Date(c.started_at).toLocaleString()}
                      </Link>
                    </td>
                    <td className="border-b border-[var(--color-border)] px-4 py-2.5 text-[var(--color-text-muted)]">{c.channel}</td>
                    <td className="border-b border-[var(--color-border)] px-4 py-2.5 text-[var(--color-text-muted)]">{durationSeconds !== null ? `${durationSeconds}s` : c.ended_at === null ? "In progress" : "—"}</td>
                    <td className="border-b border-[var(--color-border)] px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {c.answer_types.map((t) => (
                          <StatusBadge key={t} entry={ANSWER_PATH[t as keyof typeof ANSWER_PATH] ?? { label: t, icon: "Circle", tone: "neutral" }} />
                        ))}
                      </div>
                    </td>
                    <td className="border-b border-[var(--color-border)] px-4 py-2.5">
                      {c.escalated && <span className="mr-1 text-xs font-medium text-[var(--color-warning-text)]">Escalated</span>}
                      {c.ticketed && <span className="text-xs text-[var(--color-text-muted)]">Ticketed</span>}
                      {!c.escalated && !c.ticketed && <span className="text-xs text-[var(--color-text-muted)]">{c.final_status ?? "—"}</span>}
                    </td>
                    <td className="border-b border-[var(--color-border)] px-4 py-2.5 text-[var(--color-text-muted)]">${c.cost_usd.toFixed(4)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
