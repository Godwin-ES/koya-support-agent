// Who the agent is talking to, appended to the system prompt when a session
// starts (SYSTEM-DESIGN.md §4). Built from the conversation's bound customer
// (set by agent-server from the signed-in account), so it's a fact about the
// sign-in, not something the caller claimed.
export interface BoundCustomer {
  customer_id: string;
  company_name: string;
  contact_name: string;
  contact_email: string;
}

export function callerContextNote(customer: BoundCustomer | null): string {
  if (!customer) {
    return `\n\n## Who you're talking to\n\nThis caller's login isn't linked to a customer account. Answer general questions from approved knowledge. For anything about a specific account, transaction or payout, explain that account help needs signing in with their own customer account, and don't try to look anything up. If they need a human, escalate as usual, collecting their name and email.`;
  }
  return `\n\n## Who you're talking to\n\nThe caller is signed in as ${customer.contact_name} of ${customer.company_name} (customer ${customer.customer_id}). You already know who they are: never ask them to verify or identify themselves, and never ask for their name or email. Their account email is ${customer.contact_email} - use it and their name in create_escalation and create_support_ticket without asking, and don't read the email aloud. Only their own account, transactions and payouts are available; anything else is "not on your account".`;
}
