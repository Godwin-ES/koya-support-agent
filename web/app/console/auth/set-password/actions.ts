"use server";

import { redirect } from "next/navigation";
import { supabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdminClient } from "@/lib/supabase/admin";

export interface SetPasswordResult {
  error?: string;
}

/**
 * Runs on the session an invite link's callback just established - the
 * invited person has no password yet, this is how they set one. Also
 * where the account actually becomes staff: reaching this page at all
 * required a real Supabase invite (only an admin can send one via the
 * dashboard), so completing it is the staff signal - sets
 * app_metadata.is_staff via the admin client (the session-bound one from
 * supabaseServerClient can't write app_metadata at all, by design -
 * web/lib/auth.ts's own comment on why).
 */
export async function setPassword(_prev: SetPasswordResult, formData: FormData): Promise<SetPasswordResult> {
  const password = String(formData.get("password") ?? "");
  if (!password) return { error: "Enter a password." };

  const supabase = await supabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your invite link has expired. Ask for a new one." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  await supabaseAdminClient().auth.admin.updateUserById(user.id, { app_metadata: { is_staff: true } });

  redirect("/console");
}
