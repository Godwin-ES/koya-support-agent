// list_account_activity (added 2026-09-30, beyond mcp-tool-requirements.md's
// by-reference lookups): the signed-in caller's own recent transactions and
// payouts, for "what's going on with my account?" - which the by-reference
// tools could only answer with "give me a reference". Safe for the same
// reason they are: the customer comes from the sign-in (verification.ts),
// never from the input, so it only ever lists that customer's records, with
// the same customer-safe fields (no recipient names). Anything needing
// review carries the same "escalate" guidance.
import type { ToolContext } from "../context";
import { NO_CUSTOMER_ACCOUNT, verifiedCustomerId } from "./verification";

const MAX_ITEMS = 10;

export interface AccountActivityTransaction {
  transaction_id: string;
  type: string;
  amount: number;
  currency: string;
  status: string;
  date: string;
  destination_country: string | null;
  estimated_arrival: string | null;
  support_summary: string;
  guidance?: string;
}

export interface AccountActivityPayout {
  payout_id: string;
  transaction_id: string;
  amount: number;
  currency: string;
  status: string;
  scheduled_for: string | null;
  support_summary: string;
  guidance?: string;
}

export type ListAccountActivityResult =
  | typeof NO_CUSTOMER_ACCOUNT
  | { found: true; transactions: AccountActivityTransaction[]; payouts: AccountActivityPayout[]; needs_attention: number };

export async function listAccountActivity(context: ToolContext): Promise<ListAccountActivityResult> {
  const customerId = await verifiedCustomerId(context);
  if (!customerId) return NO_CUSTOMER_ACCOUNT;

  const [transactions, payouts] = await Promise.all([
    context.supabase
      .from("transactions")
      .select("transaction_id, transaction_type, amount, currency, destination_country, status, created_at, estimated_arrival, support_summary")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(MAX_ITEMS),
    context.supabase
      .from("payouts")
      .select("payout_id, transaction_id, amount, currency, status, scheduled_for, failure_reason")
      .eq("customer_id", customerId)
      .order("scheduled_for", { ascending: false, nullsFirst: false })
      .limit(MAX_ITEMS),
  ]);
  if (transactions.error) throw transactions.error;
  if (payouts.error) throw payouts.error;

  const escalate = (status: string) => (status === "review required" ? { guidance: "escalate" } : {});
  const txnItems: AccountActivityTransaction[] = (transactions.data ?? []).map((t) => ({
    transaction_id: t.transaction_id,
    type: t.transaction_type,
    amount: Number(t.amount),
    currency: t.currency,
    status: t.status,
    date: t.created_at,
    destination_country: t.destination_country,
    estimated_arrival: t.estimated_arrival,
    support_summary: t.support_summary,
    ...escalate(t.status),
  }));
  const payoutItems: AccountActivityPayout[] = (payouts.data ?? []).map((p) => ({
    payout_id: p.payout_id,
    transaction_id: p.transaction_id,
    amount: Number(p.amount),
    currency: p.currency,
    status: p.status,
    scheduled_for: p.scheduled_for,
    support_summary: p.failure_reason ? `Payout is ${p.status}. Reason: ${p.failure_reason}.` : `Payout is ${p.status}.`,
    ...escalate(p.status),
  }));
  const needsAttention = [...txnItems, ...payoutItems].filter((i) => ["delayed", "failed", "review required"].includes(i.status)).length;
  return { found: true, transactions: txnItems, payouts: payoutItems, needs_attention: needsAttention };
}
