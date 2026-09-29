"use server";

import { redirect } from "next/navigation";
import { supabaseServerClient } from "@/lib/supabase/server";

export interface SignInResult {
  error?: string;
}

export async function signIn(_prev: SignInResult, formData: FormData): Promise<SignInResult> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await supabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Incorrect email or password." };

  redirect("/");
}

/**
 * "Reviewing this project? Skip sign-in" - a one-click way in for a
 * grader, with no form fields at all. The demo account's password lives
 * only in env (DEMO_ACCOUNT_EMAIL/PASSWORD, server-side), never in the
 * browser bundle - it's subject to the exact same daily call limit as any
 * other account, deliberately (so it can also show what hitting the
 * limit looks like).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- both params are unused (no form fields at all), but useActionState requires the (state, payload) shape.
export async function demoSignIn(_prev: SignInResult, _formData: FormData): Promise<SignInResult> {
  const email = process.env.DEMO_ACCOUNT_EMAIL;
  const password = process.env.DEMO_ACCOUNT_PASSWORD;
  if (!email || !password) return { error: "The demo account isn't configured." };

  const supabase = await supabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "The demo account isn't working right now." };

  redirect("/");
}
