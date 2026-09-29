import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import ConversationsLoading from "@/app/console/(authenticated)/conversations/loading";
import QueueLoading from "@/app/console/(authenticated)/queue/loading";

describe("console loading states (SYSTEM-DESIGN.md §11.3, §11.12 assertion 6)", () => {
  it("conversations' loading.tsx renders skeletons shaped like the final list", () => {
    const { container } = render(<ConversationsLoading />);
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("queue's loading.tsx renders skeletons too", () => {
    const { container } = render(<QueueLoading />);
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });
});
