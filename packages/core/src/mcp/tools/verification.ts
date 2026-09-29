// Shared by lookup_transaction and lookup_payout (SYSTEM-DESIGN.md §5):
// whether the caller is verified as the record's own customer, read from
// the conversation lookup_customer already marked.
import type { ToolContext } from "../context";

export async function verifiedCustomerId(context: ToolContext): Promise<string | null> {
  const { data, error } = await context.supabase.from("conversations").select("verified_customer_id").eq("id", context.conversationId).maybeSingle();
  if (error) throw error;
  return (data?.verified_customer_id as string | null) ?? null;
}
