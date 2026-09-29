// Every row of SYSTEM-DESIGN.md §11.5's queue action table.
import { describe, expect, it } from "vitest";
import { deriveCaseActions } from "@core/domain/case-actions";

describe("deriveCaseActions", () => {
  it("open: start working enabled, close enabled, reopen hidden", () => {
    const a = deriveCaseActions("open");
    expect(a.startWorking).toEqual({ kind: "enabled" });
    expect(a.close).toEqual({ kind: "enabled" });
    expect(a.reopen).toEqual({ kind: "hidden" });
  });

  it("in_progress: start working hidden, close enabled, reopen hidden", () => {
    const a = deriveCaseActions("in_progress");
    expect(a.startWorking).toEqual({ kind: "hidden" });
    expect(a.close).toEqual({ kind: "enabled" });
    expect(a.reopen).toEqual({ kind: "hidden" });
  });

  it("closed: start working hidden, close hidden, reopen enabled", () => {
    const a = deriveCaseActions("closed");
    expect(a.startWorking).toEqual({ kind: "hidden" });
    expect(a.close).toEqual({ kind: "hidden" });
    expect(a.reopen).toEqual({ kind: "enabled" });
  });
});
