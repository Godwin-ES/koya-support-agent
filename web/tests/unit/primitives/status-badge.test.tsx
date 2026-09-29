import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "@/components/primitives/status-badge";
import { ANSWER_PATH, CALL_STATE } from "@core/domain/status";

describe("StatusBadge", () => {
  it("always renders text, never colour alone (SYSTEM-DESIGN.md §11.2)", () => {
    render(<StatusBadge entry={ANSWER_PATH.escalate} />);
    expect(screen.getByText("Escalate")).toBeInTheDocument();
  });

  it("renders an icon alongside the text", () => {
    const { container } = render(<StatusBadge entry={CALL_STATE.listening} />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("every status registry entry resolves to a real lucide icon (no silent typo)", async () => {
    const Icons = await import("lucide-react");
    for (const registry of [ANSWER_PATH, CALL_STATE]) {
      for (const entry of Object.values(registry)) {
        expect((Icons as unknown as Record<string, unknown>)[entry.icon], `missing lucide icon: ${entry.icon}`).toBeDefined();
      }
    }
  });
});
