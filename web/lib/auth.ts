import type { User } from "@supabase/supabase-js";

/**
 * Staff-ness lives in `app_metadata` (never `user_metadata`) - only the
 * service-role/admin API can write `app_metadata`, so a customer can
 * never grant it to themselves the way they could with `user_metadata`
 * (which `auth.updateUser()` lets any signed-in user edit on their own
 * account). Set on a staff account in exactly two places: `scripts/
 * create-staff-user.mjs` and `console/auth/set-password/actions.ts`
 * (reaching that page at all already required a real Supabase invite,
 * which only an admin can send - completing it is the staff signal).
 */
export function isStaff(user: User | null): user is User {
  return user?.app_metadata?.is_staff === true;
}
