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

/** The signed-in account with app access, or a redirect to sign-in. Same double-check as proxy.ts (defence in depth). */
export async function requireAccount(): Promise<CurrentAccount> {
  const supabase = await supabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect("/sign-in");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!hasAppAccess(user)) redirect("/sign-in");

  const meta = user.user_metadata ?? {};
  const name = typeof meta.name === "string" && meta.name.trim() ? meta.name.trim() : null;
  const firstName = typeof meta.first_name === "string" && meta.first_name.trim() ? meta.first_name.trim() : (name?.split(/\s+/)[0] ?? null);

  return { user, accessToken: session.access_token, displayName: name, greetingName: firstName };
}
