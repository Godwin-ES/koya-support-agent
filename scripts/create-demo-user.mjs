/**
 * Creates (or updates the password of, if it already exists) the public
 * app's "Sign in with demo account" account (web/app/sign-in/actions.ts's
 * demoSignIn) - a normal account, subject to the same daily call limit as
 * anyone else. Its credentials go in DEMO_ACCOUNT_EMAIL/DEMO_ACCOUNT_PASSWORD
 * (.env.local locally, the Vercel project's env for production) - never in
 * client code, since demoSignIn reads them server-side only. Prints no
 * secret values.
 *
 *   DEMO_ACCOUNT_EMAIL=demo@relaypay-support.example DEMO_ACCOUNT_PASSWORD=... node scripts/create-demo-user.mjs
 */
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) config({ path: ".env.local", quiet: true });

const email = process.env.DEMO_ACCOUNT_EMAIL;
const password = process.env.DEMO_ACCOUNT_PASSWORD;
if (!email || !password) {
  console.error("Set DEMO_ACCOUNT_EMAIL and DEMO_ACCOUNT_PASSWORD.");
  process.exit(1);
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: existing } = await supabase.auth.admin.listUsers();
const already = existing?.users.find((u) => u.email === email);

if (already) {
  const { error } = await supabase.auth.admin.updateUserById(already.id, { password, app_metadata: { ...already.app_metadata, invited: true } });
  if (error) {
    console.error(`Failed to update the demo user's password: ${error.message}`);
    process.exit(1);
  }
  console.log(`Demo user already existed - password updated: ${email} (${already.id})`);
} else {
  const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: "Demo Reviewer" }, app_metadata: { invited: true } });
  if (error) {
    console.error(`Failed to create the demo user: ${error.message}`);
    process.exit(1);
  }
  console.log(`Demo user created: ${data.user.email} (${data.user.id})`);
}
