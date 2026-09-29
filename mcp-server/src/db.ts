import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Bypasses RLS - the MCP server's own scoping (X-Conversation-Id, verified caller checks) is the security boundary, not Postgres RLS. */
export function serviceRoleClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set (see .env.example).");
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
