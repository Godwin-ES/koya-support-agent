import { describe, expect, it } from "vitest";
import { isStaff } from "@/lib/auth";
import type { User } from "@supabase/supabase-js";

function userWith(app_metadata: Record<string, unknown>): User {
  return { app_metadata } as User;
}

describe("isStaff", () => {
  it("is false for no user at all", () => {
    expect(isStaff(null)).toBe(false);
  });

  it("is false for a signed-in user with no is_staff flag - a public sign-up account (Task 13/14: this used to be enough to reach the console, a real gap)", () => {
    expect(isStaff(userWith({}))).toBe(false);
  });

  it("is false when is_staff is explicitly false or any non-true value", () => {
    expect(isStaff(userWith({ is_staff: false }))).toBe(false);
    expect(isStaff(userWith({ is_staff: "true" }))).toBe(false);
  });

  it("is true only when app_metadata.is_staff is exactly true", () => {
    expect(isStaff(userWith({ is_staff: true }))).toBe(true);
  });
});
