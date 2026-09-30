"use server";

import { redirect } from "next/navigation";
import { supabaseServerClient } from "@/lib/supabase/server";
import { isStaff } from "@/lib/auth";

export interface SignInResult {
  error?: string;
}

/** Email and password only - no self sign-up (SYSTEM-DESIGN.md §11.1). Staff accounts are created out of band (scripts/create-staff-user.mjs). */
export async function signIn(_prev: SignInResult, formData: FormData): Promise<SignInResult> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await supabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Incorrect email or password." };
  // A customer account's password is right, but the console would only
  // bounce it straight back here - which looked like the button did nothing.
  if (!isStaff(data.user)) {
    await supabase.auth.signOut();
    return { error: "This account doesn't have console access - it's a customer account. Customers sign in at the main app." };
  }

  redirect("/console");
}
