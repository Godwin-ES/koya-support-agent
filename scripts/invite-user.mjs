/**
 * Invites someone - the only way in besides the five sample customers.
 * Every invite is a staff invite: the invited person gets the support
 * console and the customer app (general questions there; account lookups
 * need a sample customer). An invite from the Supabase dashboard's "Invite
 * user" does exactly the same - Supabase's own invited_at is what makes an
 * account staff (web/lib/auth.ts isStaff).
 *
 *   node scripts/invite-user.mjs --email reviewer@example.com --name "Ada Mensah"
 *   node scripts/invite-user.mjs --email reviewer@example.com --name "Ada Mensah" --link
 *
 * By default Supabase emails the invite. Its built-in email service only
 * delivers to your own Supabase team's addresses unless a custom SMTP
 * provider is set up, so for anyone else use --link: it prints the invite
 * link for you to send yourself (one use, and it expires - treat it like a
 * password). The invitee opens it, enters their name and a password, and
 * lands in the console.
 *
 * An email that already has an account is made staff instead; no invite is
 * sent. Reads .env.local; prints no secret values other than the link you
 * asked for with --link.
 */
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) config({ path: ".env.local", quiet: true });

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const email = arg("email")?.trim().toLowerCase();
const name = arg("name")?.trim();
const linkOnly = process.argv.includes("--link");

if (!email) {
  console.error('Usage: node scripts/invite-user.mjs --email <email> --name "<full name>" [--link]');
  process.exit(1);
}
const appUrl = process.env.APP_URL?.replace(/\/$/, "");
if (!appUrl) {
  console.error("APP_URL is not set in .env.local.");
  process.exit(1);
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const access = { invited: true, is_staff: true };
// The one callback URL Supabase already allows; it leads to the staff set-up page.
const redirectTo = `${appUrl}/console/auth/callback`;

async function findUser(address) {
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === address);
    if (match || data.users.length < 1000) return match ?? null;
  }
}

async function grant(user) {
  const { error } = await supabase.auth.admin.updateUserById(user.id, { app_metadata: { ...user.app_metadata, ...access }, user_metadata: { ...user.user_metadata, ...(name ? { name } : {}) } });
  if (error) throw error;
}

const existing = await findUser(email);
if (!existing && !name) {
  console.error("--name is required for a new invite (it's how the app greets them).");
  process.exit(1);
}
if (existing) {
  await grant(existing);
  console.log(`${email} already has an account - access granted. No invite sent.`);
  process.exit(0);
}

if (linkOnly) {
  const { data, error } = await supabase.auth.admin.generateLink({ type: "invite", email, options: { redirectTo, data: { name } } });
  if (error) {
    console.error(`Couldn't create the invite: ${error.message}`);
    process.exit(1);
  }
  await grant(data.user);
  console.log(`Invite created for ${email}. Send them this link (one use):\n\n${data.properties.action_link}\n`);
} else {
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, { redirectTo, data: { name } });
  if (error) {
    console.error(`Couldn't send the invite: ${error.message}\nIf email delivery isn't set up for this address, re-run with --link.`);
    process.exit(1);
  }
  await grant(data.user);
  console.log(`Invite emailed to ${email}.`);
}
