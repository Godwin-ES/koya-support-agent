// lookup_payout (SYSTEM-DESIGN.md §5, mcp-tool-requirements.md).
//
// Only the signed-in caller's own payouts, like lookup_transaction. Recipient names are
// never returned, verified or not (SYSTEM-DESIGN.md §5, explicit). The
// payouts table has no stored support_summary (unlike transactions) - one
// is composed here from status and failure_reason, the same customer-safe
// information a human agent would read off the record.
import type { ToolContext } from "../context";
import { normalizeReference } from "../reference";
import { NO_CUSTOMER_ACCOUNT, NOT_ON_THIS_ACCOUNT, verifiedCustomerId } from "./verification";

export interface LookupPayoutInput {
  payout_id?: string;
  transaction_id?: string;
}

export type LookupPayoutResult =
  | { found: false; reason: "not_enough_to_search" }
  | typeof NO_CUSTOMER_ACCOUNT
  | typeof NOT_ON_THIS_ACCOUNT
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
  const customerId = await verifiedCustomerId(context);
  if (!customerId) return NO_CUSTOMER_ACCOUNT;

  let query = context.supabase.from("payouts").select("payout_id, transaction_id, customer_id, amount, currency, status, scheduled_for, failure_reason");
  query = input.payout_id ? query.eq("payout_id", normalizeReference("PAY", input.payout_id)) : query.eq("transaction_id", normalizeReference("TXN", input.transaction_id!));

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data || data.customer_id !== customerId) return NOT_ON_THIS_ACCOUNT;
  const escalate = data.status === "review required";
  const support_summary = composeSupportSummary(data.status, data.failure_reason);

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
