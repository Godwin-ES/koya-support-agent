"use server";

import { redirect } from "next/navigation";
import { supabaseServerClient } from "@/lib/supabase/server";

export async function signOut(): Promise<void> {
  const supabase = await supabaseServerClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}
