/**
 * One login per seed customer (Amara Okafor of LagosLedger, Daniel Mwangi of
 * NairobiOps, ...), each linked to its own customer record through
 * app_metadata.customer_id - admin-set, so no one can change which customer
 * their login belongs to. Signed in as Amara, the agent's account tools only
 * ever see Amara's records (SYSTEM-DESIGN.md §5).
 *
 * The sign-in page's "Sign in as a sample customer" picker signs people in
 * server-side with a one-time token, so these accounts get random passwords
 * no one needs to know. Safe to re-run: existing accounts are just relinked.
 * Prints no secret values.
 *
 *   node scripts/create-sample-customers.mjs
 */
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) config({ path: ".env.local", quiet: true });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: customers, error } = await supabase.from("customers").select("customer_id, contact_name, contact_email").order("customer_id");
if (error) throw error;

const { data: existing, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
if (listError) throw listError;

for (const c of customers) {
  const email = c.contact_email.toLowerCase();
  const access = { invited: true, customer_id: c.customer_id };
  const user = existing.users.find((u) => u.email?.toLowerCase() === email);
  if (user) {
    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, { app_metadata: { ...user.app_metadata, ...access }, user_metadata: { ...user.user_metadata, name: c.contact_name } });
    if (updateError) throw updateError;
    console.log(`${c.customer_id} ${c.contact_name}: linked (existing login)`);
  } else {
    const { error: createError } = await supabase.auth.admin.createUser({ email, password: randomBytes(24).toString("base64url"), email_confirm: true, app_metadata: access, user_metadata: { name: c.contact_name } });
    if (createError) throw createError;
    console.log(`${c.customer_id} ${c.contact_name}: created`);
  }
}
