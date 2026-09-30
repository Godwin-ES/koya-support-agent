import { describe, expect, it } from "vitest";
import { hasAppAccess, isStaff } from "@/lib/auth";
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

describe("isStaff - anyone invited is staff", () => {
  it("is true for an invited account (dashboard or script), and for the is_staff flag", () => {
    expect(isStaff({ app_metadata: {}, invited_at: "2026-09-30T12:00:00Z" } as User)).toBe(true);
    expect(isStaff(userWith({ is_staff: true }))).toBe(true);
  });

  it("is false for a sample customer, who is created directly rather than invited", () => {
    expect(isStaff(userWith({ invited: true, customer_id: "CUS-1001" }))).toBe(false);
  });
});

describe("hasAppAccess", () => {
  it("is true for the invite script's flag, staff, or any Supabase admin invite (including one sent from the dashboard)", () => {
    expect(hasAppAccess(userWith({ invited: true }))).toBe(true);
    expect(hasAppAccess(userWith({ is_staff: true }))).toBe(true);
    expect(hasAppAccess({ app_metadata: {}, invited_at: "2026-09-30T12:00:00Z" } as User)).toBe(true);
  });

  it("is false for an account made through public sign-up, which has none of them", () => {
    expect(hasAppAccess(userWith({ provider: "email" }))).toBe(false);
    expect(hasAppAccess(null)).toBe(false);
  });
});
