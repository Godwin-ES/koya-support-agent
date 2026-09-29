"use server";

import { redirect } from "next/navigation";
import { supabaseServerClient } from "@/lib/supabase/server";
import { isStaff } from "@/lib/auth";

/**
 * Establishes the session an invite link's tokens describe, server-side -
 * `setSession` on the SSR-cookie-bound client persists it as cookies the
 * same way `signInWithPassword` already does, so the rest of the app
 * needs no special case for "signed in via invite" vs "signed in normally".
 * Both invite kinds (scripts/invite-user.mjs) land here - the one redirect
 * URL Supabase already allows - and go on to the password page for their
 * app: staff to the console's, customers to the customer app's.
 */
export async function completeInvite(accessToken: string, refreshToken: string): Promise<void> {
  const supabase = await supabaseServerClient();
  const { data, error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  if (error) redirect("/sign-in");
  redirect(isStaff(data.user) ? "/console/auth/set-password" : "/auth/set-password");
}
