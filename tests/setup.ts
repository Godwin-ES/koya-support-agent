import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Tests must never post to the real Discord channels. Set before any test
// file's own dotenv load runs - dotenv never overrides a variable that's
// already set, even to an empty string, so .env.local can't re-enable them.
process.env.DISCORD_ALERTS_WEBHOOK_URL = "";
process.env.DISCORD_ACTIVITY_WEBHOOK_URL = "";

// vitest.config.ts sets `globals: false` deliberately (explicit imports over
// ambient test globals), so React Testing Library's own auto-cleanup - which
// detects Jest-style globals - never registers. Without this, each
// component test's rendered tree stays mounted into the next test in the
// same file, and later queries start matching more than one element.
afterEach(() => {
  cleanup();
});
