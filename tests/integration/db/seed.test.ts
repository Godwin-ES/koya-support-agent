import { describe, expect, it } from "vitest";
import path from "node:path";
import { serviceRoleClient } from "../helpers/db";
import { seedAll } from "../../../scripts/seed";

const SEED_DIR = path.resolve(process.cwd(), "..", "aat-c3-week-6-support-agent", "assets", "seed-data");

// IMPLEMENTATION-PLAN.md Task 3: "the seed runs twice with no duplicates."
describe("seedAll", () => {
  const supabase = serviceRoleClient();

  it("upserts the exact row counts from the CSVs (5 customers, 5 transactions, 3 payouts)", async () => {
    const counts = await seedAll(supabase, SEED_DIR);
    expect(counts).toEqual({ customers: 5, transactions: 5, payouts: 3 });
  });

  it("running it again writes the same rows, not duplicates", async () => {
    await seedAll(supabase, SEED_DIR);
    const second = await seedAll(supabase, SEED_DIR);
    expect(second).toEqual({ customers: 5, transactions: 5, payouts: 3 });

    const { count, error } = await supabase.from("customers").select("*", { count: "exact", head: true });
    if (error) throw error;
    expect(count).toBe(5);
  });

  it("seeds real field values, not placeholders (spot check against the CSV)", async () => {
    await seedAll(supabase, SEED_DIR);
    const { data: customer, error } = await supabase.from("customers").select().eq("customer_id", "CUS-1003").single();
    if (error) throw error;
    expect(customer).toMatchObject({
      company_name: "AccraStack",
      account_status: "restricted",
      kyc_status: "review required",
      support_notes: "Account is under compliance review. Escalate account-specific questions.",
    });

    const { data: payout, error: payoutError } = await supabase.from("payouts").select().eq("payout_id", "PAY-7001").single();
    if (payoutError) throw payoutError;
    // The empty failure_reason column in payouts.csv becomes a real null, not an empty string.
    expect(payout!.failure_reason).toBeNull();
  });
});
