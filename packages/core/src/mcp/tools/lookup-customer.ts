// lookup_customer (SYSTEM-DESIGN.md §5, mcp-tool-requirements.md).
//
// Returns the signed-in caller's own customer record and nothing else.
// Identity comes from the sign-in (the conversation's verified_customer_id,
// set by agent-server), not from identifiers spoken in the call - it used
// to verify anyone who could name two matching details, and wrote that
// match onto the conversation, so saying "I'm Amara from LagosLedger"
// unlocked Amara's records for whoever said it. Identifiers the caller
// gives are only checked against their own record: naming a different
// customer is refused.
//
// support_notes is internal (SYSTEM-DESIGN.md §5: "never returned for
// reading aloud") - the tool returns a fixed, category-based `guidance`
// string derived from account/KYC status instead of the note's own text.
import { isGuestScope, type ToolContext } from "../context";
import { GUEST_SCOPE_REFUSAL, NO_CUSTOMER_ACCOUNT, verifiedCustomerId } from "./verification";

export interface LookupCustomerInput {
  customer_id?: string;
  email?: string;
  company_name?: string;
  contact_name?: string;
}

export type LookupCustomerResult =
  | typeof NO_CUSTOMER_ACCOUNT
  | typeof GUEST_SCOPE_REFUSAL
  | { found: false; reason: "not_this_account"; guidance: string }
  | {
      found: true;
      customer_id: string;
      company_name: string;
      contact_name: string;
      plan: string;
      account_status: string;
      kyc_status: string;
      guidance: string;
    };

interface CustomerRow {
  customer_id: string;
  company_name: string;
  contact_name: string;
  contact_email: string;
  plan: string;
  account_status: string;
  kyc_status: string;
}

function eqCi(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

// A first name is a normal way to say who you are ("Amara" matches "Amara Okafor").
function contactNameMatches(recordName: string, given: string): boolean {
  return recordName.trim().toLowerCase().startsWith(given.trim().toLowerCase());
}

/** Whether every identifier the caller gave belongs to this record. */
function describesRecord(row: CustomerRow, input: LookupCustomerInput): boolean {
  if (input.customer_id && row.customer_id !== input.customer_id.trim().toUpperCase()) return false;
  if (input.email && !eqCi(row.contact_email, input.email)) return false;
  if (input.company_name && !eqCi(row.company_name, input.company_name)) return false;
  if (input.contact_name && !contactNameMatches(row.contact_name, input.contact_name)) return false;
  return true;
}

function guidanceFor(row: CustomerRow): string {
  if (row.account_status === "restricted") return "Account is restricted - escalate account-specific questions to a specialist.";
  if (row.account_status === "pending verification") return "Account is pending verification - guide the caller through verification steps, or escalate if urgent.";
  if (row.kyc_status === "review required") return "Identity verification is under review - escalate compliance questions.";
  return "No special handling needed for this account.";
}

export async function lookupCustomer(context: ToolContext, input: LookupCustomerInput): Promise<LookupCustomerResult> {
  if (isGuestScope(context)) return GUEST_SCOPE_REFUSAL;
  const customerId = await verifiedCustomerId(context);
  if (!customerId) return NO_CUSTOMER_ACCOUNT;

  const { data, error } = await context.supabase
    .from("customers")
    .select("customer_id, company_name, contact_name, contact_email, plan, account_status, kyc_status")
    .eq("customer_id", customerId)
    .single();
  if (error) throw error;
  const row = data as CustomerRow;

  if (!describesRecord(row, input)) {
    return { found: false, reason: "not_this_account", guidance: "The caller can only ask about their own account, which is the one they're signed in with. Don't discuss any other customer." };
  }

  return {
    found: true,
    customer_id: row.customer_id,
    company_name: row.company_name,
    contact_name: row.contact_name,
    plan: row.plan,
    account_status: row.account_status,
    kyc_status: row.kyc_status,
    guidance: guidanceFor(row),
  };
}
