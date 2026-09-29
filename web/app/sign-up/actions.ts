"use server";

import { redirect } from "next/navigation";
import { supabaseServerClient } from "@/lib/supabase/server";

export interface SignUpResult {
  error?: string;
}

/** Name + email + password, no confirmation email (Supabase's "Confirm email" is off for this project - a manual dashboard setting, not something this code controls) - signUp() returns an active session immediately. */
export async function signUp(_prev: SignUpResult, formData: FormData): Promise<SignUpResult> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!name || !email || !password) return { error: "Enter your name, email and password." };

  const supabase = await supabaseServerClient();
  // Not matching error.message for a specific "already registered" string -
  // Supabase's own docs say it may deliberately obscure that case (anti
  // enumeration), so a real duplicate-email signup might come back as
  // either a different error or no error at all depending on project
  // settings. One generic message covers every real failure honestly.
  const { error } = await supabase.auth.signUp({ email, password, options: { data: { name } } });
  if (error) return { error: "Couldn't create your account. Check your details, or sign in if you already have one." };

  redirect("/");
}
