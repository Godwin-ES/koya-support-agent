// lookup_customer (SYSTEM-DESIGN.md §5, mcp-tool-requirements.md).
//
// "Needs two matching identifiers": the caller-supplied identifiers are
// matched independently against every customer row (the seed set is a
// handful of rows - simplest and safest to compare in code rather than
// build a fragile OR-filter string), and the customer with the most
// matches wins. Fewer than two identifiers supplied at all is
// "not_enough_to_verify" even before checking the data; two or more
// supplied but no customer matching at least two of them is "not_found" -
// a caller who guesses one real value and one wrong one doesn't verify.
//
// support_notes is internal (SYSTEM-DESIGN.md §5: "never returned for
// reading aloud") - the tool returns a fixed, category-based `guidance`
// string derived from account/KYC status instead of the note's own text,
// so nothing written by a human reviewer for another human ever reaches a
// spoken response.
import type { ToolContext } from "../context";

export interface LookupCustomerInput {
  customer_id?: string;
  email?: string;
  company_name?: string;
  contact_name?: string;
}

export type LookupCustomerResult =
  | { found: false; reason: "not_enough_to_verify" | "not_found" }
  | {
      found: true;
      customer_id: string;
      company_name: string;
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

// Real finding, from Task 12's own evaluation run: the PRD's own scenario 3
// script ("I am Amara from LagosLedger") gives only a first name, but the
// seed record's contact_name is "Amara Okafor" - an exact match rejected
// this, so the PRD's own documented example failed to verify. A caller
// giving their first name on a support call is completely normal, so
// contact_name matches on a case-insensitive prefix instead of exact
// equality ("Amara" matches "Amara Okafor"; "Amara Okafor" still matches
// itself). company_name stays an exact match - abbreviating a company name
// is much less natural than a first name, and keeping one identifier exact
// preserves the two-factor guarantee (a caller still needs the *right*
// company, not just any name that happens to start with the right letters).
function contactNameMatches(recordName: string, given: string): boolean {
  return recordName.trim().toLowerCase().startsWith(given.trim().toLowerCase());
}

function matchCount(row: CustomerRow, input: LookupCustomerInput): number {
  let n = 0;
  if (input.customer_id && row.customer_id === input.customer_id) n++;
  if (input.email && eqCi(row.contact_email, input.email)) n++;
  if (input.company_name && eqCi(row.company_name, input.company_name)) n++;
  if (input.contact_name && contactNameMatches(row.contact_name, input.contact_name)) n++;
  return n;
}

function guidanceFor(row: CustomerRow): string {
  if (row.account_status === "restricted") return "Account is restricted - escalate account-specific questions to a specialist.";
  if (row.account_status === "pending verification") return "Account is pending verification - guide the caller through verification steps, or escalate if urgent.";
  if (row.kyc_status === "review required") return "Identity verification is under review - escalate compliance questions.";
  return "No special handling needed for this account.";
}

export async function lookupCustomer(context: ToolContext, input: LookupCustomerInput): Promise<LookupCustomerResult> {
  const providedCount = [input.customer_id, input.email, input.company_name, input.contact_name].filter(Boolean).length;
  if (providedCount < 2) return { found: false, reason: "not_enough_to_verify" };

  const { data, error } = await context.supabase
    .from("customers")
    .select("customer_id, company_name, contact_name, contact_email, plan, account_status, kyc_status");
  if (error) throw error;

  const rows = (data ?? []) as CustomerRow[];
  let best: CustomerRow | null = null;
  let bestScore = 0;
  for (const row of rows) {
    const score = matchCount(row, input);
    if (score > bestScore) {
      best = row;
      bestScore = score;
    }
  }

  if (!best || bestScore < 2) return { found: false, reason: "not_found" };

  await context.supabase.from("conversations").update({ verified_customer_id: best.customer_id }).eq("id", context.conversationId);

  return {
    found: true,
    customer_id: best.customer_id,
    company_name: best.company_name,
    plan: best.plan,
    account_status: best.account_status,
    kyc_status: best.kyc_status,
    guidance: guidanceFor(best),
  };
}
