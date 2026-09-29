// @vitest-environment node
//
// Task 11's RLS integration test: a real signed-in Supabase Auth staff
// user still cannot read application data directly - the console's own
// data access goes exclusively through the server-side, service-role
// `console-data.ts` layer (SYSTEM-DESIGN.md §7, §11.6), gated by that
// server code checking the session, never by an RLS policy granting the
// `authenticated` role table access. This is the same "zero grants to
// authenticated" finding Task 3 made for `anon`, now checked for a real,
// signed-in session rather than an anonymous one.
import { afterAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { serviceRoleClient } from "../helpers/db";

const TEST_EMAIL = `rls-test-${Date.now()}@relaypay-test.example`;
const TEST_PASSWORD = `Test-${crypto.randomUUID()}!`;

const admin = serviceRoleClient();
let testUserId: string | null = null;

afterAll(async () => {
  if (testUserId) await admin.auth.admin.deleteUser(testUserId);
});

describe("a signed-in staff session has no direct RLS access to application data", () => {
  it(
    "gets an explicit permission-denied error, not just empty RLS-filtered rows",
    async () => {
      const { data: created, error: createError } = await admin.auth.admin.createUser({ email: TEST_EMAIL, password: TEST_PASSWORD, email_confirm: true });
      if (createError) throw createError;
      testUserId = created.user.id;

      const anonClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
      const { data: session, error: signInError } = await anonClient.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASSWORD });
      if (signInError) throw signInError;
      expect(session.session).toBeTruthy();

      for (const table of ["conversations", "support_tickets", "escalations"] as const) {
        const { data, error, status } = await anonClient.from(table).select("*");
        // Confirmed live, correcting this test's own first assumption: migration
        // 007's `revoke all ... from anon, authenticated` (Task 3) is a real
        // GRANT-level revoke, not RLS-with-no-policies - a signed-in
        // `authenticated` session gets an explicit 403 permission-denied error
        // (42501), a stronger guarantee than empty-rows-via-RLS would be.
        expect({ table, data, status, code: error?.code }).toMatchObject({ table, data: null, status: 403, code: "42501" });
      }
    },
    15_000,
  );
});
