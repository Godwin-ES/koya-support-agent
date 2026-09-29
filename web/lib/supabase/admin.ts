import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * The service-role client every console data read/write actually uses
 * (SYSTEM-DESIGN.md §7: "the console reads it through server-side routes,
 * never a direct browser query"; migration comments: "service_role
 * only"). `server-only` makes importing this from a Client Component a
 * build error, not just a convention - the same guarantee as the week-5
 * bundle secret scan, enforced at compile time instead of a CI step.
 */
export function supabaseAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
}
