import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageThread } from "@/components/conversation/message-thread";

describe("MessageThread", () => {
  it("merges a speaker's consecutive lines into one bubble (voice transcripts arrive a clause at a time)", () => {
    render(
      <MessageThread
        userInitials="DR"
        label="Call transcript"
        messages={[
          { role: "user", text: "How long does a transfer take?" },
          { role: "assistant", text: "Usually two to five business days," },
          { role: "assistant", text: "depending on the destination." },
        ]}
      />,
    );
    expect(screen.getByText("Usually two to five business days, depending on the destination.")).toBeInTheDocument();
    expect(screen.getAllByText("RelayPay")).toHaveLength(1);
  });

  it("continues the current bubble with words still being spoken, instead of starting a new one", () => {
    const { container } = render(<MessageThread userInitials="DR" label="Call transcript" messages={[{ role: "assistant", text: "Usually two to five days," }]} live={{ role: "assistant", text: "depending on" }} />);
    expect(container.querySelectorAll("li")).toHaveLength(1);
    expect(screen.getByText(/depending on/)).toBeInTheDocument();
  });
});
