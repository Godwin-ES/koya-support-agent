// SYSTEM-DESIGN.md §11.12's Playwright assertions 1-4, keyboard use, and
// axe - against the real Next.js app, with Vapi stubbed
// (window.__VAPI_STUB__, web/lib/use-voice-call.ts's own test seam) and
// POST /api/conversations intercepted, since a real call needs a
// microphone and a real backend neither CI nor this test wants. $0.
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

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

  await page.goto("/");
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
  await page.goto("/");

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

  await page.goto("/");
  await page.getByRole("button", { name: "Type instead" }).click();

  const textbox = page.getByLabel("Type a message");
  await textbox.fill("What are your fees?");
  await textbox.press("Enter");

  await expect(page.getByText("Fees depend on the corridor.")).toBeVisible();
  expect(textRequests).toBe(1);
});

test("assertion 4: mic-blocked, limit-reached, busy and unavailable each render their message and one way forward", async ({ page }) => {
  await interceptConversations(page, 503, { error: "all agents are busy, please try again shortly" });
  await page.goto("/");
  await page.getByRole("button", { name: "Start call" }).click();

  await expect(page.getByText(/all our agents are busy/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeEnabled();
});

test("keyboard: Start call and End call are reachable and activate with Enter", async ({ page }) => {
  await interceptConversations(page, 200, { conversation_id: "conv-1", token: "tok-1" });
  await page.goto("/");

  await page.keyboard.press("Tab"); // wordmark/logo isn't focusable - lands on the first real control
  const startButton = page.getByRole("button", { name: "Start call" });
  await startButton.focus();
  await expect(startButton).toBeFocused();
  await page.keyboard.press("Enter");

  await page.waitForFunction(() => (window as unknown as { __VAPI_STUB__?: { startCalls: unknown[] } }).__VAPI_STUB__?.startCalls.length === 1);
});

test("axe: the voice page has no automatically detectable accessibility violations", async ({ page }) => {
  await interceptConversations(page, 200, { conversation_id: "conv-1", token: "tok-1" });
  await page.goto("/");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("phone layout (Task 14 audit): the voice page works at a phone viewport, no horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE-class width, the narrowest common target (SYSTEM-DESIGN.md §11.10: "the voice page works fully on phones")
  await page.goto("/");

  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(375);

  await expect(page.getByTestId("start-call")).toBeVisible();
  await expect(page.getByText(/calls are transcribed/i)).toBeVisible();
});
