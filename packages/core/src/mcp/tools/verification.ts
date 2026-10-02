// Which customer a conversation belongs to (SYSTEM-DESIGN.md §5). Set once,
// by agent-server, when the conversation starts - from the signed-in
// account's own server-only link (app_metadata.customer_id) - and never by
// a tool or anything the caller says. Every account tool reads it: a caller
// can only ever see their own records.
import { GUEST_SCOPE_REFUSAL, isGuestScope, type ToolContext } from "../context";

export { GUEST_SCOPE_REFUSAL };

export async function verifiedCustomerId(context: ToolContext): Promise<string | null> {
  if (isGuestScope(context)) return null;
  const { data, error } = await context.supabase.from("conversations").select("verified_customer_id").eq("id", context.conversationId).maybeSingle();
  if (error) throw error;
  return (data?.verified_customer_id as string | null) ?? null;
}

/** For a login with no customer account behind it (the demo account, a reviewer invite). */
export const NO_CUSTOMER_ACCOUNT = {
  found: false as const,
  reason: "no_customer_account" as const,
  guidance: "This caller's login isn't linked to a customer account, so no account details are available. Answer general questions; for account questions, explain they need to sign in with their own customer account.",
};

/** For a record that isn't the caller's own - the same answer whether it exists or not, so nothing about other customers leaks. */
export const NOT_ON_THIS_ACCOUNT = {
  found: false as const,
  reason: "not_on_this_account" as const,
  guidance: "Nothing with that reference is on this caller's account. Ask them to check the reference; never suggest it belongs to someone else.",
};
