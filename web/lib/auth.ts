import type { User } from "@supabase/supabase-js";

/**
 * Staff: anyone invited. An invite is how reviewers and team members get
 * in, and every one of them gets the console as well as the customer app.
 * Supabase stamps `invited_at` on every account an admin invites (from the
 * dashboard or scripts/invite-user.mjs), and only an admin can cause that -
 * public sign-up never sets it, and users can't change it. `is_staff` in
 * `app_metadata` (admin-only, unlike `user_metadata`) covers staff accounts
 * created without an invite. The sample customers are created directly, not
 * invited, so they stay customers.
 */
export function isStaff(user: User | null): user is User {
  return user?.app_metadata?.is_staff === true || Boolean(user?.invited_at);
}

/**
 * The customer app is invite-only. Access comes from any of: the `invited`
 * flag (scripts/invite-user.mjs), staff, or Supabase's own `invited_at` -
 * stamped on every account created by an admin invite, including one sent
 * from the Supabase dashboard. Public sign-up sets none of them, and none
 * can be changed by the user. (A dashboard invite used to be refused at the
 * password step, since only the script set the flag.)
 */
export function hasAppAccess(user: User | null): user is User {
  return Boolean(user?.invited_at) || user?.app_metadata?.invited === true || isStaff(user);
}

export const NO_ACCESS_MESSAGE = "This account doesn't have access yet. Access is by invitation only.";
