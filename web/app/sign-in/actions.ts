"use server";

import { redirect } from "next/navigation";
import { supabaseServerClient } from "@/lib/supabase/server";
import { hasAppAccess, NO_ACCESS_MESSAGE } from "@/lib/auth";
import { supabaseAdminClient } from "@/lib/supabase/admin";
import { isSampleCustomerId } from "@/lib/sample-customers";

export interface SignInResult {
  error?: string;
}

export async function signIn(_prev: SignInResult, formData: FormData): Promise<SignInResult> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await supabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Incorrect email or password." };
  if (!hasAppAccess(data.user)) {
    await supabase.auth.signOut();
    return { error: NO_ACCESS_MESSAGE };
  }

  redirect("/");
}

/**
 * "Sign in as a sample customer" - one click, no password. The admin API
 * issues a one-time sign-in token for that customer's own login
 * (scripts/create-sample-customers.mjs), and it's exchanged for a session
 * straight away on this server, so the token never reaches the browser.
 * Only the five seed customers can be chosen.
 */
export async function sampleCustomerSignIn(_prev: SignInResult, formData: FormData): Promise<SignInResult> {
  const customerId = String(formData.get("customer_id") ?? "");
  if (!isSampleCustomerId(customerId)) return { error: "Choose one of the sample customers." };

  const admin = supabaseAdminClient();
  const { data: customer } = await admin.from("customers").select("contact_email").eq("customer_id", customerId).maybeSingle();
  if (!customer) return { error: "That sample customer isn't set up." };
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email: (customer as { contact_email: string }).contact_email });
  if (linkError || !link.properties?.hashed_token) return { error: "That sample customer isn't set up." };

  const supabase = await supabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error || !hasAppAccess(data.user)) return { error: "Couldn't sign in as that customer right now." };

  redirect("/");
}
