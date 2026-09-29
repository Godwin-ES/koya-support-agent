"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServerClient } from "@/lib/supabase/server";
import { updateCaseStatus as updateCaseStatusData, type UpdateCaseResult } from "@/lib/server/console-data";

export async function signOut(): Promise<void> {
  const supabase = await supabaseServerClient();
  await supabase.auth.signOut();
  redirect("/console/sign-in");
}

export async function updateCaseStatus(kind: "ticket" | "escalation", id: string, newStatus: "open" | "in_progress" | "closed", expectedUpdatedAt: string): Promise<UpdateCaseResult> {
  const result = await updateCaseStatusData(kind, id, newStatus, expectedUpdatedAt);
  if (result.ok) revalidatePath("/console/queue");
  return result;
}
