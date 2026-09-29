"use server";

import { redirect } from "next/navigation";
import { supabaseServerClient } from "@/lib/supabase/server";
import { hasAppAccess, NO_ACCESS_MESSAGE } from "@/lib/auth";

export interface SetPasswordResult {
  error?: string;
}

/** The customer side of an invite: the invite link's callback established the session; this sets the account's first password. */
export async function setPassword(_prev: SetPasswordResult, formData: FormData): Promise<SetPasswordResult> {
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { error: "Use at least 8 characters." };

  const supabase = await supabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your invite link has expired. Ask for a new one." };
  if (!hasAppAccess(user)) return { error: NO_ACCESS_MESSAGE };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  redirect("/");
}
