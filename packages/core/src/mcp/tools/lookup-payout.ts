// lookup_payout (SYSTEM-DESIGN.md §5, mcp-tool-requirements.md).
//
// Same verified-caller gating as lookup_transaction. Recipient names are
// never returned, verified or not (SYSTEM-DESIGN.md §5, explicit). The
// payouts table has no stored support_summary (unlike transactions) - one
// is composed here from status and failure_reason, the same customer-safe
// information a human agent would read off the record.
import type { ToolContext } from "../context";
import { normalizeReference } from "../reference";
import { verifiedCustomerId } from "./verification";

export interface LookupPayoutInput {
  payout_id?: string;
  transaction_id?: string;
}

export type LookupPayoutResult =
  | { found: false; reason: "not_enough_to_search" | "not_found" }
  | {
      found: true;
      payout_id: string;
      status: string;
      scheduled_for: string | null;
      failure_reason: string | null;
      support_summary: string;
      guidance?: string;
      amount?: number;
      currency?: string;
    };

function composeSupportSummary(status: string, failureReason: string | null): string {
  return failureReason ? `Payout is ${status}. Reason: ${failureReason}.` : `Payout is ${status}.`;
}

export async function lookupPayout(context: ToolContext, input: LookupPayoutInput): Promise<LookupPayoutResult> {
  if (!input.payout_id && !input.transaction_id) return { found: false, reason: "not_enough_to_search" };

  let query = context.supabase.from("payouts").select("payout_id, transaction_id, customer_id, amount, currency, status, scheduled_for, failure_reason");
  query = input.payout_id ? query.eq("payout_id", normalizeReference("PAY", input.payout_id)) : query.eq("transaction_id", normalizeReference("TXN", input.transaction_id!));

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) return { found: false, reason: "not_found" };

  const verifiedId = await verifiedCustomerId(context);
  const isVerified = verifiedId !== null && verifiedId === data.customer_id;
  const escalate = data.status === "review required";
  const support_summary = composeSupportSummary(data.status, data.failure_reason);

  if (!isVerified) {
    return {
      found: true,
      payout_id: data.payout_id,
      status: data.status,
      scheduled_for: data.scheduled_for,
      failure_reason: data.failure_reason,
      support_summary,
      guidance: escalate ? "escalate" : "verify caller for details",
    };
  }

  return {
    found: true,
    payout_id: data.payout_id,
    status: data.status,
    scheduled_for: data.scheduled_for,
    failure_reason: data.failure_reason,
    support_summary,
    amount: Number(data.amount),
    currency: data.currency,
    ...(escalate ? { guidance: "escalate" } : {}),
  };
}
