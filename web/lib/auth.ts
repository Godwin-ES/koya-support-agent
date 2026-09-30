import type { User } from "@supabase/supabase-js";

/**
 * Access lives in `app_metadata` (never `user_metadata`) - only the
 * service-role/admin API can write it, so nobody can grant it to
 * themselves the way they could with `user_metadata` (which
 * `auth.updateUser()` lets any signed-in user edit on their own account).
 * Both flags are set only by `scripts/invite-user.mjs` (and the demo and
 * staff account scripts), when the invite is sent - never by the invitee
 * completing it.
 */
export function isStaff(user: User | null): user is User {
  return user?.app_metadata?.is_staff === true;
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
