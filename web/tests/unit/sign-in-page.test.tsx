// The public sign-in page (Task 13/14): the real sign-in form plus a
// "Sign in with demo account" button - a one-click way in for a grader,
// with no form fields of its own. Actions are mocked (no live Supabase
// call, $0), matching how voice-page.test.tsx mocks hooks.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const mockSignIn = vi.fn(async () => ({}));
vi.mock("@/app/sign-in/actions", () => ({
  signIn: (...args: unknown[]) => mockSignIn(...args),
  sampleCustomerSignIn: vi.fn(async () => ({})),
}));

describe("sign-in page", () => {
  it("has the real sign-in form", async () => {
    const { default: SignInPage } = await import("@/app/sign-in/page");
    render(<SignInPage />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("offers no demo-account button - the sample customers replace it", async () => {
    const { default: SignInPage } = await import("@/app/sign-in/page");
    render(<SignInPage />);
    expect(screen.queryByRole("button", { name: /demo account/i })).not.toBeInTheDocument();
  });

  it("offers each of the five sample customers as a one-click sign-in", async () => {
    const { default: SignInPage } = await import("@/app/sign-in/page");
    render(<SignInPage />);
    for (const name of ["Amara Okafor", "Daniel Mwangi", "Efua Mensah", "Amina Jacobs", "Patrick Ndayisaba"]) {
      expect(screen.getByRole("button", { name: `Sign in as ${name}` })).toBeInTheDocument();
    }
    expect(screen.queryByText("LagosLedger")).not.toBeInTheDocument();
  });

  it("offers no sign-up - access is by invitation only", async () => {
    const { default: SignInPage } = await import("@/app/sign-in/page");
    render(<SignInPage />);
    expect(screen.queryByRole("link", { name: /sign up/i })).not.toBeInTheDocument();
    expect(screen.getByText(/access is by invitation/i)).toBeInTheDocument();
  });

  it("offers general support without signing in", async () => {
    const { default: SignInPage } = await import("@/app/sign-in/page");
    render(<SignInPage />);
    expect(screen.getByRole("link", { name: "Continue as guest" })).toHaveAttribute("href", "/");
  });
});
