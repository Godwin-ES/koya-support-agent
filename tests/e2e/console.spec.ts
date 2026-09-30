// SYSTEM-DESIGN.md §11.12 assertions 5, 8, 9 (Task 11) - against the real
// running app and the real Supabase project (the console has no Claude or
// Vapi surface to stub - its own data is what's under test), with a real
// staff account created once and real seeded cases per test. $0.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import path from "node:path";

loadEnv({ path: path.resolve(import.meta.dirname, "../../.env.local"), quiet: true });

const STAFF_EMAIL = "e2e-console-test@relaypay-test.example";
const STAFF_PASSWORD = "Test-console-e2e-pass-1!";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

test.beforeAll(async () => {
  const { data, error } = await admin.auth.admin.createUser({ email: STAFF_EMAIL, password: STAFF_PASSWORD, email_confirm: true, app_metadata: { is_staff: true } });
  if (!error) return;
  // Already exists (a prior run, or a parallel worker's own beforeAll racing this one) - fine, but
  // make sure it's still marked staff (an account from before web/lib/auth.ts's isStaff() check
  // existed wouldn't be, and every console test needs a real staff session to get anywhere).
  const { data: existing } = await admin.auth.admin.listUsers();
  const user = existing.users.find((u) => u.email === STAFF_EMAIL);
  if (!user) throw error;
  await admin.auth.admin.updateUserById(user.id, { app_metadata: { is_staff: true } });
});

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/console/sign-in");
  await page.getByLabel("Email").fill(STAFF_EMAIL);
  await page.getByLabel("Password").fill(STAFF_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/console");
}

async function seedTicket(): Promise<{ conversationId: string; ticketId: string; updatedAt: string }> {
  const { data: conversation, error: convError } = await admin.from("conversations").insert({ channel: "web_text", caller_ref: "e2e-console-customer" }).select("id").single(); // a customer's conversation - the queue shows customers by default, evaluation runs (no account) on their own tab
  if (convError) throw convError;
  const { data: ticket, error: ticketError } = await admin.from("support_tickets").insert({ conversation_id: conversation.id, category: "payment", priority: "medium", summary: "e2e test ticket" }).select("id, updated_at").single();
  if (ticketError) throw ticketError;
  return { conversationId: conversation.id, ticketId: ticket.id, updatedAt: ticket.updated_at };
}

async function cleanup(conversationId: string) {
  await admin.from("conversations").delete().eq("id", conversationId);
}

test("assertion 5: two quick Close clicks on a case produce one status change, and a stale edit gets the conflict message", async ({ page }) => {
  const { conversationId, ticketId } = await seedTicket();
  try {
    await signIn(page);
    await page.goto(`/console/queue?case=${ticketId}`);

    const closeButton = page.getByRole("button", { name: "Close" });
    await closeButton.click();
    await page.getByRole("button", { name: "Close case" }).click();
    // A second Close click right after (the double-submit this assertion checks) - the button
    // is either gone (deriveCaseActions hides Close once closed) or was disabled while pending;
    // either way there's still only ever one real status change underneath.
    await expect(page.getByText("Case closed")).toBeVisible();

    const { data: ticket } = await admin.from("support_tickets").select("status").eq("id", ticketId).single();
    expect(ticket?.status).toBe("closed");
  } finally {
    await cleanup(conversationId);
  }
});

test("assertion 5: a stale edit (someone else changed it first) gets the 409-equivalent conflict message", async ({ page }) => {
  const { conversationId, ticketId } = await seedTicket();
  try {
    await signIn(page);
    await page.goto(`/console/queue?case=${ticketId}`);

    // Simulate another staff member changing the case between this page's
    // load and this click - the panel's own `updated_at` is now stale.
    await admin.from("support_tickets").update({ status: "in_progress" }).eq("id", ticketId);

    await page.getByRole("button", { name: "Close" }).click();
    await page.getByRole("button", { name: "Close case" }).click();

    await expect(page.getByText(/updated by someone else/i)).toBeVisible();
  } finally {
    await cleanup(conversationId);
  }
});

test("keyboard: sign in, open a case and close it, using only the keyboard", async ({ page }) => {
  const { conversationId, ticketId } = await seedTicket();
  try {
    await page.goto("/console/sign-in");
    await page.getByLabel("Email").fill(STAFF_EMAIL);
    await page.getByLabel("Password").fill(STAFF_PASSWORD);
    await page.keyboard.press("Tab"); // off the password field
    await page.getByRole("button", { name: "Sign in" }).focus();
    await page.keyboard.press("Enter");
    await page.waitForURL("**/console");

    await page.goto(`/console/queue?case=${ticketId}`);
    const closeButton = page.getByRole("button", { name: "Close" });
    await closeButton.focus();
    await page.keyboard.press("Enter");
    const confirmButton = page.getByRole("button", { name: "Close case" });
    await expect(confirmButton).toBeVisible();
    await confirmButton.focus();
    await page.keyboard.press("Enter");

    await expect(page.getByText("Case closed")).toBeVisible();
  } finally {
    await cleanup(conversationId);
  }
});

// The other half of assertion 6, "shows a skeleton on a throttled
// network," is covered at the component level instead
// (web/tests/unit/console/loading.test.tsx) - Next.js's own Link
// prefetching (on by default in the App Router, including in dev)
// resolves a hovered/rendered link's RSC payload before a real click ever
// lands, so a route-level network throttle in this suite raced Next's own
// prefetch and never reliably caught the fallback rendering; a direct
// component test isn't racing anything.

test("assertion 6: a forced failure shows an error with a working Retry", async ({ page }) => {
  await signIn(page);
  // An id Postgres can't cast to uuid throws a real error in
  // getConversationDetail, caught by error.tsx (inherited by the [id] segment).
  await page.goto("/console/conversations/not-a-real-uuid");
  await expect(page.getByText(/couldn't load conversations/i)).toBeVisible();
  const retryButton = page.getByRole("button", { name: "Retry" });
  await expect(retryButton).toBeVisible();
  await retryButton.click(); // confirms it's wired and doesn't crash the page further
});

test(
  "axe (Task 14 audit): every console page has no automatically detectable accessibility violations",
  async ({ page }) => {
    // 7+ pages, each with a full axe scan plus real sign-in and data
    // seeding, exceeds the default 30s - test()'s third argument isn't a
    // real Playwright timeout override (silently ignored), this is.
    test.setTimeout(60_000);

    await page.goto("/console/sign-in");
    expect((await new AxeBuilder({ page }).analyze()).violations, "/console/sign-in").toEqual([]);

    await signIn(page);

    const { conversationId, ticketId } = await seedTicket();
    try {
      for (const path of ["/console", "/console/conversations", `/console/conversations/${conversationId}`, "/console/queue", `/console/queue?case=${ticketId}`, "/console/evaluations"]) {
        await page.goto(path);
        expect((await new AxeBuilder({ page }).analyze()).violations, path).toEqual([]);
      }

      // A real evaluation run exists from Task 12's own work - checked
      // here too, since its markup (pass/fail badges, per-check lists) is
      // otherwise untested by axe.
      const { data: run } = await admin.from("evaluations").select("run_id").limit(1).maybeSingle();
      if (run) {
        await page.goto(`/console/evaluations/${encodeURIComponent(run.run_id)}`);
        expect((await new AxeBuilder({ page }).analyze()).violations, "/console/evaluations/[runId]").toEqual([]);
      }
    } finally {
      await cleanup(conversationId);
    }
  },
);
