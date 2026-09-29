"use server";

import { redirect } from "next/navigation";
import { supabaseServerClient } from "@/lib/supabase/server";

export interface SignInResult {
  error?: string;
}

/** Email and password only - no self sign-up (SYSTEM-DESIGN.md §11.1). Staff accounts are created out of band (scripts/create-staff-user.mjs). */
export async function signIn(_prev: SignInResult, formData: FormData): Promise<SignInResult> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await supabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Incorrect email or password." };

  redirect("/console");
}
