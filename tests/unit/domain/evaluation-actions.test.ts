import { describe, expect, it } from "vitest";
import { deriveEvaluationActions } from "@core/domain/evaluation-actions";

describe("deriveEvaluationActions", () => {
  it("run evaluation is enabled and cancel is hidden when nothing is running", () => {
    const a = deriveEvaluationActions({ isRunning: false });
    expect(a.runEvaluation).toEqual({ kind: "enabled" });
    expect(a.cancelRun).toEqual({ kind: "hidden" });
  });

  it("run evaluation is disabled with a reason and cancel is enabled while running", () => {
    const a = deriveEvaluationActions({ isRunning: true });
    expect(a.runEvaluation).toEqual({ kind: "disabled", reason: "An evaluation is already running" });
    expect(a.cancelRun).toEqual({ kind: "enabled" });
  });
});
