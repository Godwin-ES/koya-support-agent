// The customer app and the console keep separate sign-ins. They used to share
// one session cookie: signing in to the console in one tab replaced the
// customer app's session under another open tab, whose next navigation then
// failed ("This page couldn't load") until a refresh. Two tabs, one browser
// (one cookie jar), exactly the way a reviewer would use both.
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import path from "node:path";

loadEnv({ path: path.resolve(import.meta.dirname, "../../.env.local"), quiet: true });

const STAFF_EMAIL = "e2e-console-test@relaypay-test.example";
const STAFF_PASSWORD = "Test-console-e2e-pass-1!";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

test.beforeAll(async () => {
  const { error } = await admin.auth.admin.createUser({ email: STAFF_EMAIL, password: STAFF_PASSWORD, email_confirm: true, app_metadata: { is_staff: true } });
  if (!error) return;
  const { data } = await admin.auth.admin.listUsers();
  if (!data.users.some((u) => u.email === STAFF_EMAIL)) throw error;
});

test("signing in to the console doesn't disturb the customer app open in another tab, and each signs out on its own", async ({ context }) => {
  test.setTimeout(90_000);
  const customerTab = await context.newPage();
  await customerTab.goto("/sign-in");
  await customerTab.getByRole("button", { name: "Sign in as Amara Okafor" }).click();
  await customerTab.waitForURL((u) => u.pathname === "/");
  await expect(customerTab.getByRole("heading", { name: "Hi Amara, how can we help?" })).toBeVisible();

  const consoleTab = await context.newPage();
  await consoleTab.goto("/console/sign-in");
  await consoleTab.getByLabel("Email").fill(STAFF_EMAIL);
  await consoleTab.getByLabel("Password").fill(STAFF_PASSWORD);
  await consoleTab.getByRole("button", { name: "Sign in", exact: true }).click();
  await consoleTab.waitForURL((u) => u.pathname === "/console");

  // Back in the customer tab: still Amara, and navigation still works.
  await customerTab.getByRole("link", { name: "History" }).click();
  await customerTab.waitForURL((u) => u.pathname === "/history");
  await expect(customerTab.getByRole("heading", { name: "Your conversations" })).toBeVisible();
  await expect(customerTab.locator("header")).toContainText("Amara Okafor");
  await customerTab.getByRole("link", { name: "Support", exact: true }).click();
  await expect(customerTab.getByRole("heading", { name: "Hi Amara, how can we help?" })).toBeVisible();

  // Signing out of the customer app leaves the console signed in, and the other way round.
  await customerTab.getByRole("button", { name: "Sign out" }).click();
  await customerTab.waitForURL((u) => u.pathname === "/sign-in");
  await consoleTab.reload();
  expect(new URL(consoleTab.url()).pathname).toBe("/console");

  await customerTab.getByRole("button", { name: "Sign in as Amara Okafor" }).click();
  await customerTab.waitForURL((u) => u.pathname === "/");
  await consoleTab.getByRole("button", { name: "Sign out" }).click();
  await consoleTab.waitForURL((u) => u.pathname === "/console/sign-in");
  await customerTab.reload();
  await expect(customerTab.getByRole("heading", { name: "Hi Amara, how can we help?" })).toBeVisible();
});
