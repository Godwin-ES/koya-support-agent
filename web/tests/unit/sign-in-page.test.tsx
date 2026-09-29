// The public sign-in page (Task 13/14): the real sign-in form plus a
// "Sign in with demo account" button - a one-click way in for a grader,
// with no form fields of its own. Actions are mocked (no live Supabase
// call, $0), matching how voice-page.test.tsx mocks hooks.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockSignIn = vi.fn(async () => ({}));
const mockDemoSignIn = vi.fn(async () => ({}));
vi.mock("@/app/sign-in/actions", () => ({
  signIn: (...args: unknown[]) => mockSignIn(...args),
  demoSignIn: (...args: unknown[]) => mockDemoSignIn(...args),
}));

describe("sign-in page", () => {
  it("has the real sign-in form", async () => {
    const { default: SignInPage } = await import("@/app/sign-in/page");
    render(<SignInPage />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("offers a one-click demo account with no form fields of its own", async () => {
    const { default: SignInPage } = await import("@/app/sign-in/page");
    const user = userEvent.setup();
    render(<SignInPage />);

    const demoButton = screen.getByRole("button", { name: /sign in with demo account/i });
    expect(demoButton).toBeInTheDocument();
    await user.click(demoButton);
    expect(mockDemoSignIn).toHaveBeenCalled();
  });

  it("links to sign-up for a visitor without an account", async () => {
    const { default: SignInPage } = await import("@/app/sign-in/page");
    render(<SignInPage />);
    expect(screen.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/sign-up");
  });
});
