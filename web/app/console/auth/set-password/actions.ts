"use server";

import { redirect } from "next/navigation";
import { supabaseServerClient } from "@/lib/supabase/server";

export interface SetPasswordResult {
  error?: string;
}

/** Runs on the session an invite link's callback just established - the invited person has no password yet, this is how they set one. */
export async function setPassword(_prev: SetPasswordResult, formData: FormData): Promise<SetPasswordResult> {
  const password = String(formData.get("password") ?? "");
  if (!password) return { error: "Enter a password." };

  const supabase = await supabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  redirect("/console");
}
