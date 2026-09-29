// SYSTEM-DESIGN.md §11.12's Playwright assertions (Task 10), against the
// real Next.js dev server with Vapi stubbed (globalThis.__VAPI_STUB__,
// web/lib/use-voice-call.ts) and /api/conversations intercepted per test -
// no real backend, no real Claude or Vapi spend.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx next dev --port 3100",
    cwd: "./web",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      NEXT_PUBLIC_VAPI_PUBLIC_KEY: "test-public-key",
      NEXT_PUBLIC_VAPI_ASSISTANT_ID: "test-assistant-id",
      NEXT_PUBLIC_AGENT_SERVER_URL: "http://127.0.0.1:3100/__stub_agent_server__",
    },
  },
});
