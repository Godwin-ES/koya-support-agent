// The console's sign-in action: a correct password on a customer (non-staff)
// account is refused with a clear message and signed out, instead of
// redirecting to /console and being bounced straight back (which looked
// like the button did nothing).
import { beforeEach, describe, expect, it, vi } from "vitest";

const signInWithPassword = vi.fn();
const signOut = vi.fn(async () => ({ error: null }));
vi.mock("@/lib/supabase/server", () => ({ supabaseServerClient: async () => ({ auth: { signInWithPassword, signOut } }) }));
const redirect = vi.fn((path: string) => {
  throw new Error(`redirect:${path}`);
});
vi.mock("next/navigation", () => ({ redirect: (path: string) => redirect(path) }));

const { signIn } = await import("@/app/console/sign-in/actions");

function form(email: string, password: string): FormData {
  const f = new FormData();
  f.set("email", email);
  f.set("password", password);
  return f;
}

beforeEach(() => {
  signInWithPassword.mockReset();
  signOut.mockClear();
  redirect.mockClear();
});

describe("console sign-in", () => {
  it("refuses a customer account with a clear message and signs it out", async () => {
    signInWithPassword.mockResolvedValue({ data: { user: { app_metadata: {}, invited_at: "2026-09-30T12:00:00Z" } }, error: null });
    const result = await signIn({}, form("customer@example.com", "right-password"));
    expect(result.error).toMatch(/doesn't have console access/);
    expect(signOut).toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("lets a staff account through to the console", async () => {
    signInWithPassword.mockResolvedValue({ data: { user: { app_metadata: { is_staff: true } } }, error: null });
    await expect(signIn({}, form("staff@example.com", "right-password"))).rejects.toThrow("redirect:/console");
  });

  it("still says a wrong password is wrong", async () => {
    signInWithPassword.mockResolvedValue({ data: { user: null }, error: { message: "Invalid login credentials" } });
    expect(await signIn({}, form("staff@example.com", "wrong"))).toEqual({ error: "Incorrect email or password." });
  });
});
