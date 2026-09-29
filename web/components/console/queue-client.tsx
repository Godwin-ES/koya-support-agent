"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { deriveCaseActions } from "@core/domain/case-actions";
import { TICKET_STATUS, ESCALATION_STATUS } from "@core/domain/status";
import type { CaseItem } from "@/lib/server/console-data";
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

  if (cases.length === 0) {
    return <EmptyState message="No tickets or escalations waiting. New ones appear here as calls need follow-up." />;
  }

  return (
    <div className="flex gap-6">
      <table className="w-full flex-1 border-collapse text-sm">
        <thead className="text-left text-xs text-[var(--color-text-muted)]">
          <tr>
            <th className="border-b border-[var(--color-border)] py-2 pr-4">Type</th>
            <th className="border-b border-[var(--color-border)] py-2 pr-4">Category</th>
            <th className="border-b border-[var(--color-border)] py-2 pr-4">Status</th>
            <th className="border-b border-[var(--color-border)] py-2 pr-4">Summary</th>
            <th className="border-b border-[var(--color-border)] py-2 pr-4">Age</th>
          </tr>
        </thead>
        <tbody>
          {cases.map((item) => {
            const registry = item.kind === "ticket" ? TICKET_STATUS : ESCALATION_STATUS;
            return (
              <tr key={item.id} className="cursor-pointer hover:bg-[var(--color-surface-2)]" onClick={() => router.push(`/console/queue?case=${item.id}`)}>
                <td className="border-b border-[var(--color-border)] py-2 pr-4 capitalize">{item.kind}</td>
                <td className="border-b border-[var(--color-border)] py-2 pr-4">{item.category}</td>
                <td className="border-b border-[var(--color-border)] py-2 pr-4">
                  <StatusBadge entry={registry[item.status]} />
                </td>
                <td className="max-w-xs truncate border-b border-[var(--color-border)] py-2 pr-4">{item.summary}</td>
                <td className="border-b border-[var(--color-border)] py-2 pr-4">{formatAge(item.created_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {openCase && (
        <aside aria-label="Case detail" className="w-80 flex-shrink-0 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="flex items-start justify-between">
            <h2 className="text-sm font-semibold capitalize">{openCase.kind}</h2>
            <button type="button" onClick={() => router.back()} className="text-xs text-[var(--color-accent)] hover:underline">
              Back
            </button>
          </div>
          <StatusBadge entry={(openCase.kind === "ticket" ? TICKET_STATUS : ESCALATION_STATUS)[openCase.status]} className="mt-2" />
          <p className="mt-2 text-sm">{openCase.summary}</p>
          {openCase.callback_time && <p className="mt-1 text-xs text-[var(--color-text-muted)]">Callback: {new Date(openCase.callback_time).toLocaleString()}</p>}
          {conflictMessage && (
            <p role="alert" className="mt-2 text-xs text-[var(--color-danger-text)]">
              {conflictMessage}
            </p>
          )}
          <div className="mt-3 flex flex-col gap-2">
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
  );
}

function formatAge(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "under an hour";
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
