export type AccessScope = "customer" | "account_without_customer" | "guest" | "evaluation";

const PUBLIC_TOOLS = ["search_knowledge", "log_conversation_event"] as const;
const PRIVATE_TOOLS = ["lookup_customer", "lookup_transaction", "lookup_payout", "list_account_activity", "create_support_ticket", "create_escalation"] as const;

export function allowedToolsForScope(scope: AccessScope): readonly string[] {
  return scope === "guest" ? PUBLIC_TOOLS : [...PUBLIC_TOOLS, ...PRIVATE_TOOLS];
}
