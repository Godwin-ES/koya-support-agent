// lookup_transaction (SYSTEM-DESIGN.md §5, mcp-tool-requirements.md).
//
// Only the signed-in caller's own transactions (verification.ts). Anyone
// else's - or one that doesn't exist - gets the same "not on this account",
// so not even a status leaks. A "review required" status adds an escalate
// guidance, since that's a human decision.
import type { ToolContext } from "../context";
import { normalizeReference } from "../reference";
import { NO_CUSTOMER_ACCOUNT, NOT_ON_THIS_ACCOUNT, verifiedCustomerId } from "./verification";

export interface LookupTransactionInput {
  transaction_id: string;
}

export type LookupTransactionResult =
  | typeof NO_CUSTOMER_ACCOUNT
  | typeof NOT_ON_THIS_ACCOUNT
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
  const customerId = await verifiedCustomerId(context);
  if (!customerId) return NO_CUSTOMER_ACCOUNT;
  const normalized = normalizeReference("TXN", input.transaction_id);

  const { data, error } = await context.supabase
    .from("transactions")
    .select("transaction_id, customer_id, transaction_type, amount, currency, destination_country, status, estimated_arrival, support_summary")
    .eq("transaction_id", normalized)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.customer_id !== customerId) return NOT_ON_THIS_ACCOUNT;
  const escalate = data.status === "review required";

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
