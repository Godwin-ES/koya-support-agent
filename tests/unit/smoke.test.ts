import { describe, expect, it } from "vitest";
import { CORE_PACKAGE_READY } from "@core/index";

// Proves the workspace wiring (packages/core -> @core alias, Vitest config,
// tsconfig paths) before any real code is written (IMPLEMENTATION-PLAN.md
// Task 1's "done when pnpm install and an empty test run pass").
describe("workspace wiring", () => {
  it("resolves @core/* through the shared package", () => {
    expect(CORE_PACKAGE_READY).toBe(true);
  });
});
