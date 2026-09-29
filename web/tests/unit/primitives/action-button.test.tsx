import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActionButton } from "@/components/primitives/action-button";

/**
 * SYSTEM-DESIGN.md §11.4: the one place double-submission is actually
 * prevented, once, rather than remembered per button. Every mutating
 * control on the voice page and the console goes through this component.
 */
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("ActionButton", () => {
  it("disables and sets aria-busy immediately on click, before the action resolves", async () => {
    const user = userEvent.setup();
    const slow = deferred();
    render(<ActionButton action={() => slow.promise} idleLabel="Start call" pendingLabel="Connecting…" />);

    await user.click(screen.getByRole("button"));

    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true");

    slow.resolve();
  });

  it("invokes the action exactly once for a double click - two clicks on Start call create one conversation", async () => {
    const user = userEvent.setup();
    const slow = deferred();
    const spy = vi.fn(() => slow.promise);
    render(<ActionButton action={spy} idleLabel="Start call" />);
    const button = screen.getByRole("button");

    await Promise.all([user.click(button), user.click(button)]);

    expect(spy).toHaveBeenCalledTimes(1);
    slow.resolve();
  });

  it("exposes a visible and accessible reason when disabled", () => {
    render(<ActionButton action={() => {}} idleLabel="Start call" state={{ kind: "disabled", reason: "Daily call limit reached. Try again tomorrow" }} />);
    const button = screen.getByRole("button");
    expect(button).toHaveAccessibleDescription("Daily call limit reached. Try again tomorrow");
    expect(button).toHaveAttribute("title", "Daily call limit reached. Try again tomorrow");
    expect(button).toBeDisabled();
  });

  it("uses the action state's own label override instead of idleLabel (e.g. 'Try again')", () => {
    render(<ActionButton action={() => {}} idleLabel="Start call" state={{ kind: "enabled", label: "Try again" }} />);
    expect(screen.getByRole("button")).toHaveTextContent("Try again");
  });

  it("sends a stable idempotency key across retries of the same intent", async () => {
    const user = userEvent.setup();
    const keys: string[] = [];
    const failing = vi.fn((key: string) => {
      keys.push(key);
      return Promise.reject(new Error("network blip"));
    });
    render(<ActionButton action={failing} idleLabel="Start call" onError={() => {}} />);
    const button = screen.getByRole("button");

    await user.click(button);
    await waitFor(() => expect(button).not.toBeDisabled());
    await user.click(button);
    await waitFor(() => expect(button).not.toBeDisabled());

    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("renders nothing when the action state is hidden", () => {
    const { container } = render(<ActionButton action={() => {}} idleLabel="Start call" state={{ kind: "hidden" }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("returns to idle and re-enables after the action settles", async () => {
    const user = userEvent.setup();
    const slow = deferred();
    render(<ActionButton action={() => slow.promise} idleLabel="Start call" />);
    const button = screen.getByRole("button");

    await user.click(button);
    expect(button).toBeDisabled();

    slow.resolve();
    await waitFor(() => expect(button).not.toBeDisabled());
    expect(button).toHaveAttribute("aria-busy", "false");
  });

  it("only swaps to the pending label after the 400ms no-flash threshold", async () => {
    vi.useFakeTimers();
    try {
      const slow = deferred();
      render(<ActionButton action={() => slow.promise} idleLabel="Start call" pendingLabel="Connecting…" />);
      const button = screen.getByRole("button");

      fireEvent.click(button);
      expect(button).toHaveTextContent("Start call");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(button).toHaveTextContent("Connecting…");

      slow.resolve();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows progressive feedback only after 10 seconds pending", async () => {
    vi.useFakeTimers();
    try {
      const slow = deferred();
      render(<ActionButton action={() => slow.promise} idleLabel="Start call" />);
      fireEvent.click(screen.getByRole("button"));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(screen.queryByText(/still working/i)).not.toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5500);
      });
      expect(screen.getByText(/still working/i)).toBeInTheDocument();

      slow.resolve();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a confirm-required action shows a dialog and does not run until confirmed", async () => {
    const user = userEvent.setup();
    const spy = vi.fn(() => Promise.resolve());
    render(<ActionButton action={spy} idleLabel="Close" confirm={{ title: "Close this case?", description: "This marks it resolved." }} />);

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByText("Close this case?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
  });

  it("cancelling the confirm dialog never runs the action", async () => {
    const user = userEvent.setup();
    const spy = vi.fn(() => Promise.resolve());
    render(<ActionButton action={spy} idleLabel="Close" confirm={{ title: "Close this case?", description: "This marks it resolved." }} />);

    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(spy).not.toHaveBeenCalled();
    expect(screen.queryByText("Close this case?")).not.toBeInTheDocument();
  });
});
