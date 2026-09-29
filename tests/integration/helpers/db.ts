import { config as loadEnv } from "dotenv";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Resolved from process.cwd() (always the workspace root, per the test
// runner config), not import.meta.url - same reasoning as week 5's
// equivalent helper: this file needs to work under both Vitest and any
// future Playwright suite without two versions of itself.
const appDir = process.cwd();
loadEnv({ path: path.join(appDir, ".env.local") });

/** Bypasses RLS entirely - what agent-server and mcp-server use. */
export function serviceRoleClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set - integration tests need a real Supabase project (see .env.example).");
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/**
 * A plain anon-key client, no session - what a browser looks like to RLS
 * before (and, per SYSTEM-DESIGN.md §7, even after) sign-in: nothing in
 * this project grants `anon` or `authenticated` any access at all, so
 * there's no equivalent of week 5's `anonClientAs(accessToken)` to build.
 */
export function anonClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set.");
  }
  return createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
}
