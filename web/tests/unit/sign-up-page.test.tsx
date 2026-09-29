import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/app/sign-up/actions", () => ({ signUp: vi.fn(async () => ({})) }));

describe("sign-up page", () => {
  it("has name, email and password fields, and links to sign-in", async () => {
    const { default: SignUpPage } = await import("@/app/sign-up/page");
    render(<SignUpPage />);
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create account" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
  });
});
