import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NotFound from "@/app/not-found";
import ErrorPage from "@/app/error";

describe("customer app status pages", () => {
  it("not-found explains itself and offers a way back", () => {
    render(<NotFound />);
    expect(screen.getByRole("heading", { name: "We couldn't find that page" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to support" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Your conversations" })).toHaveAttribute("href", "/history");
  });

  it("the error page's Try again re-fetches the page (retry), and offers a way back", async () => {
    const retry = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ErrorPage error={new Error("boom")} retry={retry} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Back to support" })).toBeInTheDocument();
  });
});
