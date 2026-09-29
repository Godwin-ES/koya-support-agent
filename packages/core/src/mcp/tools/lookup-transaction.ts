// lookup_transaction (SYSTEM-DESIGN.md §5, mcp-tool-requirements.md).
//
// Amount, currency and destination only go back once the caller is
// verified as *that transaction's* customer (lookup_customer having
// already matched conversations.verified_customer_id) - otherwise status
// only, plus guidance to verify. A "review required" status always adds
// an escalate guidance, verified or not, since that's a human decision
// either way.
import type { ToolContext } from "../context";
import { normalizeReference } from "../reference";
import { verifiedCustomerId } from "./verification";

export interface LookupTransactionInput {
  transaction_id: string;
}

export type LookupTransactionResult =
  | { found: false; reason: "not_found" }
  | {
      found: true;
      transaction_id: string;
      status: string;
      guidance?: string;
      type?: string;
      amount?: number;
      currency?: string;
      destination_country?: string | null;
      estimated_arrival?: string | null;
      support_summary?: string;
    };

export async function lookupTransaction(context: ToolContext, input: LookupTransactionInput): Promise<LookupTransactionResult> {
  const normalized = normalizeReference("TXN", input.transaction_id);

  const { data, error } = await context.supabase
    .from("transactions")
    .select("transaction_id, customer_id, transaction_type, amount, currency, destination_country, status, estimated_arrival, support_summary")
    .eq("transaction_id", normalized)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { found: false, reason: "not_found" };

  const verifiedId = await verifiedCustomerId(context);
  const isVerified = verifiedId !== null && verifiedId === data.customer_id;
  const escalate = data.status === "review required";

  if (!isVerified) {
    return {
      found: true,
      transaction_id: data.transaction_id,
      status: data.status,
      guidance: escalate ? "escalate" : "verify caller for details",
    };
  }

  return {
    found: true,
    transaction_id: data.transaction_id,
    status: data.status,
    type: data.transaction_type,
    amount: Number(data.amount),
    currency: data.currency,
    destination_country: data.destination_country,
    estimated_arrival: data.estimated_arrival,
    support_summary: data.support_summary,
    ...(escalate ? { guidance: "escalate" } : {}),
  };
}
