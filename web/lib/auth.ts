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

/** The customer app is invite-only: an invited account, or staff. An account made through Supabase's public sign-up endpoint has neither. */
export function hasAppAccess(user: User | null): user is User {
  return user?.app_metadata?.invited === true || isStaff(user);
}

export const NO_ACCESS_MESSAGE = "This account doesn't have access yet. Access is by invitation only.";
