/**
 * Creates a console staff account (SYSTEM-DESIGN.md §11.1: "no self
 * sign-up" - accounts are created out of band, here). Prints no secret
 * values.
 *
 *   STAFF_EMAIL=you@relaypay.example STAFF_PASSWORD=... node scripts/create-staff-user.mjs
 */
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) config({ path: ".env.local", quiet: true });

const email = process.env.STAFF_EMAIL;
const password = process.env.STAFF_PASSWORD;
if (!email || !password) {
  console.error("Set STAFF_EMAIL and STAFF_PASSWORD.");
  process.exit(1);
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
if (error) {
  console.error(`Failed to create staff user: ${error.message}`);
  process.exit(1);
}
console.log(`Staff user created: ${data.user.email} (${data.user.id})`);
