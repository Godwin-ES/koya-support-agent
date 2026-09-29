// Loads the three seed CSVs (assets/seed-data/) into customers,
// transactions and payouts - upserted on their primary key, so it's safe to
// re-run (IMPLEMENTATION-PLAN.md Task 3: "the seed runs twice with no
// duplicates"). SYSTEM-DESIGN.md §7. `seedAll` is exported so
// tests/integration/db/seed.test.ts can call the exact same logic against
// a real Supabase project, rather than re-implementing it.
//
//   pnpm seed
import { readFileSync } from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

/** A minimal RFC-4180 line parser (handles quoted fields with commas) - the seed CSVs don't currently need it, but a hand-edited future one might. */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const parseLine = (line: string): string[] => {
    const fields: string[] = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (inQuotes) {
        if (char === '"' && line[i + 1] === '"') {
          field += '"';
          i++;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          field += char;
        }
      } else if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        fields.push(field);
        field = "";
      } else {
        field += char;
      }
    }
    fields.push(field);
    return fields;
  };

  const header = parseLine(lines[0]!);
  return lines.slice(1).map((line) => {
    const values = parseLine(line);
    return Object.fromEntries(header.map((key, i) => [key, values[i]?.trim() ?? ""]));
  });
}

function emptyToNull(value: string): string | null {
  return value === "" ? null : value;
}

async function upsertCsv(
  supabase: SupabaseClient,
  seedDir: string,
  file: string,
  table: string,
  onConflict: string,
  mapRow: (row: Record<string, string>) => Record<string, unknown>,
): Promise<number> {
  const csvPath = path.join(seedDir, file);
  const rows = parseCsv(readFileSync(csvPath, "utf-8")).map(mapRow);
  const { error } = await supabase.from(table).upsert(rows, { onConflict });
  if (error) throw new Error(`seeding ${table} from ${file}: ${error.message}`);
  return rows.length;
}

/** Upserts all three seed CSVs; returns the row count written per table. Safe to call more than once. */
export async function seedAll(supabase: SupabaseClient, seedDir: string): Promise<Record<"customers" | "transactions" | "payouts", number>> {
  const customers = await upsertCsv(supabase, seedDir, "customers.csv", "customers", "customer_id", (r) => ({
    customer_id: r.customer_id,
    company_name: r.company_name,
    contact_name: r.contact_name,
    contact_email: r.contact_email,
    plan: r.plan,
    account_status: r.account_status,
    region: r.region,
    kyc_status: r.kyc_status,
    support_notes: emptyToNull(r.support_notes ?? ""),
  }));

  const transactions = await upsertCsv(supabase, seedDir, "transactions.csv", "transactions", "transaction_id", (r) => ({
    transaction_id: r.transaction_id,
    customer_id: r.customer_id,
    transaction_type: r.transaction_type,
    amount: r.amount,
    currency: r.currency,
    destination_country: emptyToNull(r.destination_country ?? ""),
    status: r.status,
    created_at: r.created_at,
    estimated_arrival: emptyToNull(r.estimated_arrival ?? ""),
    support_summary: r.support_summary,
  }));

  const payouts = await upsertCsv(supabase, seedDir, "payouts.csv", "payouts", "payout_id", (r) => ({
    payout_id: r.payout_id,
    transaction_id: r.transaction_id,
    customer_id: r.customer_id,
    recipient_name: r.recipient_name,
    amount: r.amount,
    currency: r.currency,
    status: r.status,
    scheduled_for: emptyToNull(r.scheduled_for ?? ""),
    failure_reason: emptyToNull(r.failure_reason ?? ""),
  }));

  return { customers, transactions, payouts };
}

async function main() {
  const { config } = await import("dotenv");
  config({ path: ".env.local", quiet: true });
  const { createClient } = await import("@supabase/supabase-js");

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (see .env.example)");
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const seedDir = path.resolve(process.cwd(), "..", "aat-c3-week-6-support-agent", "assets", "seed-data");

  const counts = await seedAll(supabase, seedDir);
  for (const [table, count] of Object.entries(counts)) console.log(`${table}: upserted ${count} row(s)`);
  console.log("Seed complete.");
}

// Only run as a CLI, not when seedAll is imported (e.g. by the seed test).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
