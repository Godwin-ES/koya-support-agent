import Link from "next/link";
import { formatDateTime, formatDuration } from "@core/domain/format-time";
import { listConversations, parseSource } from "@/lib/server/console-data";
import { SourceTabs } from "@/components/console/source-tabs";
import { OutcomePill, channelLabel } from "@/components/console/outcome-pill";
import { EmptyState } from "@/components/primitives/async-state";

/** Who, what they asked, when, how long and how it ended - the columns a support agent scans. Cost and per-turn detail live on the conversation's own page. */
export default async function ConversationsPage({ searchParams }: { searchParams: Promise<{ channel?: string; escalated?: string; source?: string }> }) {
  const params = await searchParams;
  const source = parseSource(params.source);
  const conversations = await listConversations({ channel: params.channel, escalated: params.escalated === "true" ? true : undefined, source });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-[var(--color-text)]">Conversations</h1>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SourceTabs basePath="/console/conversations" current={source} />
        <p className="text-sm text-[var(--color-text-muted)]">
          {conversations.length} {source === "customers" ? "customer conversation" : "evaluation conversation"}
          {conversations.length === 1 ? "" : "s"}
        </p>
      </div>

      {conversations.length === 0 ? (
        <EmptyState message={source === "customers" ? "No customer conversations yet. New calls and chats appear here as they happen." : "No evaluation runs yet."} />
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)]">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-[var(--color-surface-2)] text-left text-xs font-medium tracking-wide text-[var(--color-text-muted)]">
              <tr>
                <th className="border-b border-[var(--color-border)] px-4 py-2.5">Customer</th>
                <th className="border-b border-[var(--color-border)] px-4 py-2.5">First question</th>
                <th className="border-b border-[var(--color-border)] px-4 py-2.5">Channel</th>
                <th className="border-b border-[var(--color-border)] px-4 py-2.5">Started</th>
                <th className="border-b border-[var(--color-border)] px-4 py-2.5">Length</th>
                <th className="border-b border-[var(--color-border)] px-4 py-2.5">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {conversations.map((c) => {
                const durationSeconds = c.ended_at ? Math.max(0, Math.round((new Date(c.ended_at).getTime() - new Date(c.started_at).getTime()) / 1000)) : null;
                return (
                  <tr key={c.id} className="group relative [transition:background-color_var(--transition-fast)] hover:bg-[var(--color-surface-hover)]">
                    <td className="border-b border-[var(--color-border)] px-4 py-3">
                      {/* The whole row opens the conversation; this link is what keyboard and screen-reader users land on. */}
                      <Link href={`/console/conversations/${c.id}`} className="font-medium text-[var(--color-text)] after:absolute after:inset-0 hover:text-[var(--color-accent)] focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-[var(--color-accent)]">
                        {c.person?.name ?? "Evaluation run"}
                      </Link>
                      {c.person?.detail && <span className="block text-xs text-[var(--color-text-muted)]">{c.person.detail}</span>}
                    </td>
                    <td className="max-w-[320px] border-b border-[var(--color-border)] px-4 py-3">
                      <span className="line-clamp-2 text-[var(--color-text)]">{c.opener ?? <span className="text-[var(--color-text-muted)]">No messages</span>}</span>
                    </td>
                    <td className="whitespace-nowrap border-b border-[var(--color-border)] px-4 py-3 text-[var(--color-text-muted)]">{channelLabel(c.channel)}</td>
                    <td className="whitespace-nowrap border-b border-[var(--color-border)] px-4 py-3 text-[var(--color-text-muted)]">{formatDateTime(c.started_at)}</td>
                    <td className="whitespace-nowrap border-b border-[var(--color-border)] px-4 py-3 text-[var(--color-text-muted)]">{durationSeconds !== null ? formatDuration(durationSeconds) : "—"}</td>
                    <td className="border-b border-[var(--color-border)] px-4 py-3">
                      <OutcomePill outcome={c.outcome} />
                    </td>
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
