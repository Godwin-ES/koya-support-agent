"use server";

import { redirect } from "next/navigation";
import { supabaseServerClient } from "@/lib/supabase/server";

/**
 * Establishes the session an invite link's tokens describe, server-side -
 * `setSession` on the SSR-cookie-bound client persists it as cookies the
 * same way `signInWithPassword` already does, so the rest of the app
 * needs no special case for "signed in via invite" vs "signed in normally".
 */
export async function completeInvite(accessToken: string, refreshToken: string): Promise<void> {
  const supabase = await supabaseServerClient();
  const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  redirect(error ? "/console/sign-in" : "/console/auth/set-password");
}
