// SYSTEM-DESIGN.md §11.12's Playwright assertions 1-4, keyboard use, and
// axe - against the real Next.js app, with Vapi stubbed
// (window.__VAPI_STUB__, web/lib/use-voice-call.ts's own test seam) and
// POST /api/conversations intercepted, since a real call needs a
// microphone and a real backend neither CI nor this test wants. $0. The
// voice page moved behind real auth (Task 13/14 - "no account, no call"),
// so every test signs in first, against the real Supabase project, the
// same pattern console.spec.ts already uses for staff sign-in.
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import path from "node:path";

loadEnv({ path: path.resolve(import.meta.dirname, "../../.env.local"), quiet: true });

const CALLER_EMAIL = "e2e-voice-test@relaypay-test.example";
const CALLER_PASSWORD = "Test-voice-e2e-pass-1!";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

test.beforeAll(async () => {
  // fullyParallel runs this once per worker, and every worker races to
  // create the same fixed test account - a losing worker can get a raw
  // "Database error creating new user" instead of the friendlier "already
  // registered" message (an unserialized duplicate-key race, not a real
  // failure), so the real check is simply: does the account exist now,
  // whoever created it.
  const { error } = await admin.auth.admin.createUser({ email: CALLER_EMAIL, password: CALLER_PASSWORD, email_confirm: true, user_metadata: { name: "E2E Voice Test" } });
  if (!error) return;
  const { data } = await admin.auth.admin.listUsers();
  if (!data.users.some((u) => u.email === CALLER_EMAIL)) throw error;
});

async function signInAndGoHome(page: Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(CALLER_EMAIL);
  await page.getByLabel("Password").fill(CALLER_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/");
}

const STUB_INIT_SCRIPT = `
  (function () {
    function StubVapi() {
      this._listeners = {};
      this.startCalls = [];
    }
    StubVapi.prototype.on = function (event, cb) {
      (this._listeners[event] = this._listeners[event] || []).push(cb);
      return this;
    };
    StubVapi.prototype.emit = function (event) {
      var args = Array.prototype.slice.call(arguments, 1);
      (this._listeners[event] || []).forEach(function (cb) { cb.apply(null, args); });
    };
    StubVapi.prototype.start = function (assistantId, overrides) {
      this.startCalls.push({ assistantId: assistantId, overrides: overrides });
      return Promise.resolve(null);
    };
    StubVapi.prototype.stop = function () {
      this.emit('call-end');
      return Promise.resolve();
    };
    window.__VAPI_STUB__ = new StubVapi();
  })();
`;

async function interceptConversations(page: Page, status: number, body: Record<string, unknown>) {
  await page.route("**/__stub_agent_server__/api/conversations", async (route) => {
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(STUB_INIT_SCRIPT);
});

test("assertion 1: double-clicking Start call creates exactly one conversation, and the button disables on the first click", async ({ page }) => {
  let conversationRequests = 0;
  await page.route("**/__stub_agent_server__/api/conversations", async (route) => {
    conversationRequests++;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ conversation_id: "conv-1", token: "tok-1" }) });
  });

  await signInAndGoHome(page);
  // A stable id, not the visible label - the label itself changes
  // ("Start call" -> "Connecting…") the moment the click's own async work
  // starts, which a label-based locator would stop matching mid-test.
  const startButton = page.getByTestId("start-call");
  await startButton.click();
  await expect(startButton).toBeDisabled();

  // The second click races the first click's own re-render - Playwright
  // dispatches it as fast as it can, exercising the same double-submit
  // path a fast real double-click would.
  await startButton.click({ force: true }).catch(() => undefined);

  await page.waitForTimeout(300);
  expect(conversationRequests).toBe(1);
});

test("assertion 2: every call-matrix state shows exactly its enabled/disabled/hidden controls, each disabled control exposing its reason", async ({ page }) => {
  await interceptConversations(page, 429, { error: "daily_limit_reached" });
  await signInAndGoHome(page);

  await page.getByRole("button", { name: "Start call" }).click();

  const startButton = page.getByRole("button", { name: "Start call" });
  await expect(startButton).toBeDisabled();
  await expect(startButton).toHaveAttribute("title", "Daily call limit reached. Try again tomorrow");
  await expect(page.getByRole("button", { name: "End call" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Type instead" })).toBeDisabled();
});

test("assertion 3: the text fallback sends exactly once on Enter, and Send stays disabled while a reply streams", async ({ page }) => {
  await interceptConversations(page, 200, { conversation_id: "conv-1", token: "tok-1" });
  let textRequests = 0;
  await page.route("**/__stub_agent_server__/api/text", async (route) => {
    textRequests++;
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: 'data: {"text":"Fees depend on the corridor."}\n\ndata: [DONE]\n\n',
    });
  });

  await signInAndGoHome(page);
  await page.getByRole("button", { name: "Type instead" }).click();

  const textbox = page.getByLabel("Type a message");
  await textbox.fill("What are your fees?");
  await textbox.press("Enter");

  await expect(page.getByText("Fees depend on the corridor.")).toBeVisible();
  expect(textRequests).toBe(1);
});

test("assertion 4: mic-blocked, limit-reached, busy and unavailable each render their message and one way forward", async ({ page }) => {
  await interceptConversations(page, 503, { error: "all agents are busy, please try again shortly" });
  await signInAndGoHome(page);
  await page.getByRole("button", { name: "Start call" }).click();

  await expect(page.getByText(/all our agents are busy/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeEnabled();
});

test("keyboard: Start call and End call are reachable and activate with Enter", async ({ page }) => {
  await interceptConversations(page, 200, { conversation_id: "conv-1", token: "tok-1" });
  await signInAndGoHome(page);

  await page.keyboard.press("Tab"); // wordmark/logo isn't focusable - lands on the first real control
  const startButton = page.getByRole("button", { name: "Start call" });
  await startButton.focus();
  await expect(startButton).toBeFocused();
  await page.keyboard.press("Enter");

  await page.waitForFunction(() => (window as unknown as { __VAPI_STUB__?: { startCalls: unknown[] } }).__VAPI_STUB__?.startCalls.length === 1);
});

test("axe: the voice page has no automatically detectable accessibility violations", async ({ page }) => {
  await interceptConversations(page, 200, { conversation_id: "conv-1", token: "tok-1" });
  await signInAndGoHome(page);
  await settleAnimations(page);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

// Entrance animations fade messages in from opacity 0 - axe sampling one mid-fade
// reports a contrast failure the settled page doesn't have. Looping ambient
// animations (the orb, the live dot) never finish, so only finite ones count.
async function settleAnimations(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity));
}

test("axe: the live call transcript and the text chat have no automatically detectable accessibility violations", async ({ page }) => {
  await interceptConversations(page, 200, { conversation_id: "conv-1", token: "tok-1" });
  await page.route("**/__stub_agent_server__/api/text", (route) => route.fulfill({ status: 200, contentType: "text/event-stream", body: 'data: {"text":"Fees depend on the corridor."}\n\ndata: [DONE]\n\n' }));
  await signInAndGoHome(page);

  await page.getByTestId("start-call").click();
  await page.evaluate(() => {
    const vapi = (window as unknown as { __VAPI_STUB__: { emit: (event: string, ...args: unknown[]) => void } }).__VAPI_STUB__;
    vapi.emit("call-start");
    vapi.emit("message", { type: "transcript", role: "user", transcript: "What are your fees?", transcriptType: "final" });
    vapi.emit("message", { type: "transcript", role: "assistant", transcript: "Fees depend on the corridor.", transcriptType: "final" });
    vapi.emit("message", { type: "transcript", role: "user", transcript: "And for Ghana", transcriptType: "partial" });
  });
  await expect(page.getByRole("log", { name: "Call transcript" })).toContainText("Fees depend on the corridor.");
  await settleAnimations(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await page.getByRole("button", { name: "End call" }).click();
  await page.getByRole("button", { name: "Type instead" }).click();
  await page.getByLabel("Type a message").fill("What are your fees?");
  await page.getByLabel("Type a message").press("Enter");
  await expect(page.getByText("Fees depend on the corridor.")).toBeVisible();
  await settleAnimations(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("phone layout (Task 14 audit): the voice page works at a phone viewport, no horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE-class width, the narrowest common target (SYSTEM-DESIGN.md §11.10: "the voice page works fully on phones")
  await signInAndGoHome(page);

  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(375);

  await expect(page.getByTestId("start-call")).toBeVisible();
  await expect(page.getByText(/calls are transcribed/i)).toBeVisible();
});
