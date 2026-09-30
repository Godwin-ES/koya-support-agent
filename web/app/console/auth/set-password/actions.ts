"use server";

import { redirect } from "next/navigation";
import { supabaseServerClient } from "@/lib/supabase/server";
import { isStaff } from "@/lib/auth";

export interface SetPasswordResult {
  error?: string;
}

/**
 * Finishes an invite: the invited person has no name or password yet (a
 * dashboard invite collects neither), so this sets both. The first name is
 * what the app and the agent greet them by. Staff-ness itself comes from the
 * invite (lib/auth.ts isStaff), not from anything submitted here.
 */
export async function setPassword(_prev: SetPasswordResult, formData: FormData): Promise<SetPasswordResult> {
  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!firstName || !lastName) return { error: "Enter your first and last name." };
  if (password.length < 8) return { error: "Use at least 8 characters for your password." };

  const supabase = await supabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your invite link has expired. Ask for a new one." };
  if (!isStaff(user)) return { error: "This link isn't a valid invite. Ask for a new one." };

  const { error } = await supabase.auth.updateUser({ password, data: { first_name: firstName, last_name: lastName, name: `${firstName} ${lastName}` } });
  if (error) return { error: error.message };

  redirect("/console");
}
