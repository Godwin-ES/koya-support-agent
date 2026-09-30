"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MessagesSquare, TicketCheck, UserRoundCheck } from "lucide-react";
import { formatDateTime } from "@core/domain/format-time";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { deriveCaseActions } from "@core/domain/case-actions";
import { caseReference } from "@core/domain/case-reference";
import { TICKET_STATUS, ESCALATION_STATUS } from "@core/domain/status";
import type { CaseItem, CasePriority } from "@/lib/server/console-data";
import { updateCaseStatus } from "@/app/console/(authenticated)/actions";
import { StatusBadge } from "@/components/primitives/status-badge";
import { ActionButton } from "@/components/primitives/action-button";
import { EmptyState } from "@/components/primitives/async-state";

export function QueueClient({ initialCases }: { initialCases: CaseItem[] }) {
  const [cases, setCases] = useState(initialCases);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const openCaseId = searchParams.get("case");
  const openCase = useMemo(() => cases.find((c) => c.id === openCaseId) ?? null, [cases, openCaseId]);

  // Keeps the Customers / Evaluation runs tab when opening a case.
  function caseUrl(caseId: string): string {
    const params = new URLSearchParams(searchParams.toString());
    params.set("case", caseId);
    return `/console/queue?${params.toString()}`;
  }

  async function handleStatusChange(item: CaseItem, newStatus: CaseItem["status"]) {
    const result = await updateCaseStatus(item.kind, item.id, newStatus, item.updated_at);
    if (result.ok) {
      setCases((prev) => prev.map((c) => (c.id === item.id ? { ...c, status: newStatus, updated_at: result.updated_at } : c)));
      setConflictMessage(null);
      toast(newStatus === "closed" ? "Case closed" : newStatus === "in_progress" ? "Now in progress" : "Reopened");
      return;
    }
    if (result.conflict) {
      setConflictMessage("This case was updated by someone else. Refresh to see the latest.");
      return;
    }
    toast.error("Couldn't update the case.");
  }

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const visible = cases.filter((c) => (statusFilter === "all" ? true : statusFilter === "active" ? c.status !== "closed" : c.status === "closed") && (kindFilter === "all" || c.kind === kindFilter));
  const activeCount = cases.filter((c) => c.status !== "closed").length;

  if (cases.length === 0) {
    return <EmptyState message="No tickets or escalations yet. New ones appear here when a conversation needs follow-up." />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented label="Status" value={statusFilter} onChange={setStatusFilter} options={[{ value: "active", label: `Active (${activeCount})` }, { value: "closed", label: "Closed" }, { value: "all", label: "All" }]} />
        <Segmented label="Type" value={kindFilter} onChange={setKindFilter} options={[{ value: "all", label: "All types" }, { value: "escalation", label: "Escalations" }, { value: "ticket", label: "Tickets" }]} />
      </div>

      <div className="flex gap-6">
        <div className="min-w-0 flex-1 overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)]">
          {visible.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-[var(--color-text-muted)]">{statusFilter === "active" ? "Nothing waiting - every case is closed." : "No cases match these filters."}</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead className="bg-[var(--color-surface-2)] text-left text-xs font-medium tracking-wide text-[var(--color-text-muted)]">
                <tr>
                  <th className="border-b border-[var(--color-border)] px-3 py-2.5">Case</th>
                  <th className="border-b border-[var(--color-border)] px-3 py-2.5">Customer</th>
                  <th className="border-b border-[var(--color-border)] px-3 py-2.5">Priority</th>
                  <th className="border-b border-[var(--color-border)] px-3 py-2.5">Status</th>
                  <th className="border-b border-[var(--color-border)] px-3 py-2.5">Callback</th>
                  <th className="border-b border-[var(--color-border)] px-3 py-2.5">Opened</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => {
                  const registry = item.kind === "ticket" ? TICKET_STATUS : ESCALATION_STATUS;
                  const isOpen = item.id === openCaseId;
                  return (
                    <tr
                      key={item.id}
                      className={cn(
                        "cursor-pointer border-l-2 [transition:background-color_var(--transition-fast),border-color_var(--transition-fast)]",
                        isOpen ? "border-[var(--color-accent)] bg-[var(--color-surface-hover)]" : "border-transparent hover:bg-[var(--color-surface-hover)]",
                      )}
                      onClick={() => router.push(caseUrl(item.id))}
                    >
                      <td className="border-b border-[var(--color-border)] px-3 py-3">
                        <Link href={caseUrl(item.id)} onClick={(e) => e.stopPropagation()} className="flex items-center gap-2 font-medium text-[var(--color-text)] hover:text-[var(--color-accent)]">
                          {item.kind === "escalation" ? <UserRoundCheck className="size-4 shrink-0 text-[var(--color-warning-text)]" aria-hidden="true" /> : <TicketCheck className="size-4 shrink-0 text-[var(--color-info-text)]" aria-hidden="true" />}
                          <span className="capitalize">{item.kind === "escalation" ? `${item.category} escalation` : `${item.category} ticket`}</span>
                        </Link>
                        <span className="mt-0.5 block max-w-[260px] truncate text-xs text-[var(--color-text-muted)]">{item.summary}</span>
                      </td>
                      <td className="border-b border-[var(--color-border)] px-3 py-3">
                        <span className="block whitespace-nowrap text-[var(--color-text)]">{item.person?.name ?? "—"}</span>
                        {item.person?.detail && <span className="block text-xs text-[var(--color-text-muted)]">{item.person.detail}</span>}
                      </td>
                      <td className="border-b border-[var(--color-border)] px-3 py-3">
                        <PriorityPill priority={item.priority} />
                      </td>
                      <td className="border-b border-[var(--color-border)] px-3 py-3">
                        <StatusBadge entry={registry[item.status]} />
                      </td>
                      <td className="whitespace-nowrap border-b border-[var(--color-border)] px-3 py-3 text-[var(--color-text-muted)]">{item.callback_time ? formatDateTime(item.callback_time) : "—"}</td>
                      <td className="whitespace-nowrap border-b border-[var(--color-border)] px-3 py-3 text-[var(--color-text-muted)]">{formatAge(item.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {openCase && (
          <aside aria-label="Case detail" className="w-80 flex-shrink-0 self-start rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-md)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold capitalize">{openCase.kind === "escalation" ? `${openCase.category} escalation` : `${openCase.category} ticket`}</h2>
                <p className="mt-0.5 font-mono text-xs text-[var(--color-text-muted)]">{caseReference(openCase.kind, openCase.id)}</p>
              </div>
              <button type="button" onClick={() => router.back()} className="text-xs font-medium text-[var(--color-accent)] [transition:opacity_var(--transition-fast)] hover:opacity-80 hover:underline">
                Back
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusBadge entry={(openCase.kind === "ticket" ? TICKET_STATUS : ESCALATION_STATUS)[openCase.status]} />
              <PriorityPill priority={openCase.priority} />
            </div>

            <dl className="mt-4 space-y-3 border-t border-[var(--color-border)] pt-4 text-sm">
              <div>
                <dt className="text-xs text-[var(--color-text-muted)]">Customer</dt>
                <dd className="mt-0.5 font-medium text-[var(--color-text)]">
                  {openCase.person?.name ?? "—"}
                  {openCase.person?.detail && <span className="font-normal text-[var(--color-text-muted)]"> · {openCase.person.detail}</span>}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--color-text-muted)]">What it&apos;s about</dt>
                <dd className="mt-0.5 leading-relaxed text-[var(--color-text)]">{openCase.summary}</dd>
              </div>
              {openCase.callback_time && (
                <div>
                  <dt className="text-xs text-[var(--color-text-muted)]">Callback booked</dt>
                  <dd className="mt-0.5 font-medium text-[var(--color-text)]">{formatDateTime(openCase.callback_time)}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-[var(--color-text-muted)]">Opened</dt>
                <dd className="mt-0.5 text-[var(--color-text)]">{formatDateTime(openCase.created_at)}</dd>
              </div>
            </dl>

            <Link href={`/console/conversations/${openCase.conversation_id}`} className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-accent)] hover:underline">
              <MessagesSquare className="size-4" aria-hidden="true" />
              Open conversation
            </Link>

            {conflictMessage && (
              <p role="alert" className="mt-3 text-xs text-[var(--color-danger-text)]">
                {conflictMessage}
              </p>
            )}
            <div className="mt-4 flex flex-col gap-2 border-t border-[var(--color-border)] pt-4">
              {(() => {
                const actions = deriveCaseActions(openCase.status);
                return (
                  <>
                    <ActionButton action={() => handleStatusChange(openCase, "in_progress")} idleLabel="Start working" state={actions.startWorking} variant="secondary" />
                    <ActionButton
                      action={() => handleStatusChange(openCase, "closed")}
                      idleLabel="Close"
                      state={actions.close}
                      variant="danger"
                      confirm={{ title: "Close this case?", description: "This marks it resolved. You can reopen it later if needed.", confirmLabel: "Close case" }}
                    />
                    <ActionButton action={() => handleStatusChange(openCase, "open")} idleLabel="Reopen" state={actions.reopen} variant="secondary" />
                  </>
                );
              })()}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

type StatusFilter = "active" | "closed" | "all";
type KindFilter = "all" | "escalation" | "ticket";

/** A segmented control as a radio group - the right pattern for one-of-several, and never mistaken for an action button. */
function Segmented<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string }> }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-[var(--shadow-sm)]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-[var(--radius-md)] px-3 py-1.5 text-sm font-medium [transition:background-color_var(--transition-fast),color_var(--transition-fast)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]",
            value === o.value ? "bg-[var(--color-accent-soft)] text-[var(--color-accent-hover)]" : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const PRIORITY_TONE: Record<CasePriority, string> = {
  urgent: "bg-[var(--color-danger-bg)] text-[var(--color-danger-text)]",
  high: "bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]",
  medium: "bg-[var(--color-info-bg)] text-[var(--color-info-text)]",
  low: "bg-[var(--color-surface-2)] text-[var(--color-text-muted)]",
};

function PriorityPill({ priority }: { priority: CasePriority }) {
  return <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ring-black/5", PRIORITY_TONE[priority])}>{priority}</span>;
}

function formatAge(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return minutes <= 1 ? "just now" : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
