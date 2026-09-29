import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DegradedState, EmptyState, ErrorState, Skeleton } from "@/components/primitives/async-state";

describe("EmptyState", () => {
  it("says what would be here and offers the next action, never a bare 'No data'", () => {
    const onClick = vi.fn();
    render(<EmptyState message="No escalations waiting. New ones appear here as calls need a specialist." action={{ label: "Refresh", onClick }} />);
    expect(screen.getByText(/no escalations waiting/i)).toBeInTheDocument();
    expect(screen.queryByText(/^no data$/i)).not.toBeInTheDocument();
  });
});

describe("ErrorState", () => {
  it("says what failed and offers a working Retry", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<ErrorState message="Couldn't load conversations." onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load conversations.");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("DegradedState", () => {
  it("shows the reason as a first-class state, not hidden", () => {
    render(<DegradedState reason="answer_type inferred - the agent did not declare a decision" />);
    expect(screen.getByText(/inferred/)).toBeInTheDocument();
  });
});

describe("Skeleton", () => {
  it("is hidden from assistive tech (it carries no content)", () => {
    const { container } = render(<Skeleton className="h-4 w-32" />);
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
  });
});
