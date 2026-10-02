import "server-only";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabaseServerClient } from "@/lib/supabase/server";
import { hasAppAccess } from "@/lib/auth";

export interface CurrentAccount {
  user: User;
  accessToken: string;
  displayName: string | null;
  /** First name to greet by. */
  greetingName: string | null;
}

export async function getCurrentAccount(): Promise<CurrentAccount | null> {
  const supabase = await supabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!hasAppAccess(user)) return null;
  const meta = user.user_metadata ?? {};
  const name = typeof meta.name === "string" && meta.name.trim() ? meta.name.trim() : null;
  const firstName = typeof meta.first_name === "string" && meta.first_name.trim() ? meta.first_name.trim() : (name?.split(/\s+/)[0] ?? null);
  return { user, accessToken: session.access_token, displayName: name, greetingName: firstName };
}

/** The signed-in account with app access, or a redirect to sign-in. Same double-check as proxy.ts (defence in depth). */
export async function requireAccount(): Promise<CurrentAccount> {
  return (await getCurrentAccount()) ?? redirect("/sign-in");
}
