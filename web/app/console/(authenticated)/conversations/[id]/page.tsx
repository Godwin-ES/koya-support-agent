import { notFound } from "next/navigation";
import Link from "next/link";
import { ANSWER_PATH, TOOL_CALL_STATUS } from "@core/domain/status";
import { getConversationDetail } from "@/lib/server/console-data";
import { StatusBadge } from "@/components/primitives/status-badge";
import { DegradedState, EmptyState } from "@/components/primitives/async-state";

/** "The centrepiece of the demo" (SYSTEM-DESIGN.md §11.8): header, then the turn timeline. */
export default async function ConversationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const conversation = await getConversationDetail(id);
  if (!conversation) notFound();

  const durationSeconds = conversation.ended_at ? Math.round((new Date(conversation.ended_at).getTime() - new Date(conversation.started_at).getTime()) / 1000) : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-[var(--color-text)]">Conversation</h1>
        <div className="mt-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-sm)]">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-[var(--color-text-muted)]">Channel</dt>
              <dd className="mt-0.5 font-medium text-[var(--color-text)]">{conversation.channel}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--color-text-muted)]">Started</dt>
              <dd className="mt-0.5 font-medium text-[var(--color-text)]">{new Date(conversation.started_at).toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--color-text-muted)]">Duration</dt>
              <dd className="mt-0.5 font-medium text-[var(--color-text)]">{durationSeconds !== null ? `${durationSeconds}s` : "In progress"}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--color-text-muted)]">Final status</dt>
              <dd className="mt-0.5 font-medium text-[var(--color-text)]">{conversation.final_status ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--color-text-muted)]">Model</dt>
              <dd className="mt-0.5 font-medium text-[var(--color-text)]">{conversation.model ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--color-text-muted)]">Cost</dt>
              <dd className="mt-0.5 font-medium text-[var(--color-text)]">${conversation.cost_usd.toFixed(4)}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--color-text-muted)]">Verified customer</dt>
              <dd className="mt-0.5 font-medium text-[var(--color-text)]">{conversation.verified_customer_company_name ?? "Not verified"}</dd>
            </div>
          </dl>
          {(conversation.ticket || conversation.escalation) && (
            <div className="mt-4 flex gap-4 border-t border-[var(--color-border)] pt-4">
              {conversation.ticket && (
                <Link href={`/console/queue?case=${conversation.ticket.id}`} className="text-sm font-medium text-[var(--color-accent)] hover:underline">
                  Ticket ({conversation.ticket.status}) →
                </Link>
              )}
              {conversation.escalation && (
                <Link href={`/console/queue?case=${conversation.escalation.id}`} className="text-sm font-medium text-[var(--color-accent)] hover:underline">
                  Escalation ({conversation.escalation.status}) →
                </Link>
              )}
            </div>
          )}
        </div>
      </div>

      {conversation.turns.length === 0 && <EmptyState message="No turns recorded yet. This usually means the call ended before the caller said anything." />}

      <ol aria-label="Turn timeline" className="flex flex-col gap-4">
        {conversation.turns.map((turn) => (
          <li key={turn.id} className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-sm)]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-[var(--color-text-muted)]">Turn {turn.seq}</span>
              <div className="flex items-center gap-2">
                <StatusBadge entry={ANSWER_PATH[turn.answer_type as keyof typeof ANSWER_PATH] ?? { label: turn.answer_type, icon: "Circle", tone: "neutral" }} />
                {turn.answer_type_inferred && <DegradedState reason="inferred - the agent did not declare a decision this turn" />}
                {turn.interrupted && <DegradedState reason="interrupted" />}
              </div>
            </div>
            {turn.confidence_note && <p className="mt-1.5 text-xs text-[var(--color-text-muted)]">{turn.confidence_note}</p>}
            <div className="mt-3 space-y-1.5 border-t border-[var(--color-border)] pt-3">
              <p className="text-sm text-[var(--color-text-muted)]">
                <span className="font-medium">Caller: </span>
                {turn.user_transcript}
              </p>
              <p className="text-sm text-[var(--color-text)]">
                <span className="font-medium text-[var(--color-text-muted)]">Agent: </span>
                {turn.assistant_response}
              </p>
            </div>

            {turn.retrieval && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {turn.retrieval.source_titles.length === 0 ? (
                  <DegradedState reason="knowledge search found nothing above the relevance floor" />
                ) : (
                  turn.retrieval.source_titles.map((title, i) => (
                    <details key={i} className="rounded-full bg-[var(--color-info-bg)] px-2.5 py-1 text-xs text-[var(--color-info-text)] ring-1 ring-inset ring-black/5">
                      <summary className="cursor-pointer">{title}</summary>
                      <p className="mt-1 max-w-xs text-[var(--color-text)]">{turn.retrieval!.source_summaries[i]}</p>
                    </details>
                  ))
                )}
              </div>
            )}

            {turn.tool_calls.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1.5 text-xs">
                {turn.tool_calls.map((call, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <StatusBadge entry={TOOL_CALL_STATUS[call.status as keyof typeof TOOL_CALL_STATUS] ?? { label: call.status, icon: "Circle", tone: "neutral" }} />
                    <span className="font-medium text-[var(--color-text)]">{call.tool_name}</span>
                    {call.result_summary && <span className="text-[var(--color-text-muted)]">— {call.result_summary}</span>}
                    {call.duration_ms !== null && <span className="text-[var(--color-text-muted)]">({call.duration_ms}ms)</span>}
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-3 border-t border-[var(--color-border)] pt-3 text-xs text-[var(--color-text-muted)]">
              {turn.ttft_ms !== null ? `${turn.ttft_ms}ms to first word` : "—"} · {turn.total_ms !== null ? `${turn.total_ms}ms total` : "—"}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
