import "server-only";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdminClient } from "@/lib/supabase/admin";
import { hasAppAccess } from "@/lib/auth";

export interface CurrentAccount {
  user: User;
  accessToken: string;
  displayName: string | null;
  /** First name to greet by - null for the shared demo account. */
  greetingName: string | null;
  /** The linked customer's company, for a sample-customer login. */
  companyName: string | null;
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

  const name = user.user_metadata?.name;
  const displayName = typeof name === "string" && name.trim() ? name.trim() : null;
  const customerId = typeof user.app_metadata?.customer_id === "string" ? user.app_metadata.customer_id : null;
  const { data: customer } = customerId ? await supabaseAdminClient().from("customers").select("company_name").eq("customer_id", customerId).maybeSingle() : { data: null };
  const isDemo = Boolean(process.env.DEMO_ACCOUNT_EMAIL) && user.email === process.env.DEMO_ACCOUNT_EMAIL;

  return {
    user,
    accessToken: session.access_token,
    displayName,
    greetingName: isDemo ? null : (displayName?.split(/\s+/)[0] ?? null),
    companyName: (customer as { company_name: string } | null)?.company_name ?? null,
  };
}
