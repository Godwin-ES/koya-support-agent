// deriveEvaluationActions (SYSTEM-DESIGN.md §11.5) - the console
// evaluations page's Run evaluation / Cancel run controls. "Run
// evaluation"'s confirm dialog shows the scenario count, model and
// estimated cost - the caller's job, not this function's.
import { disabled, enabled, HIDDEN, type ActionState } from "./action-state";

export interface EvaluationState {
  isRunning: boolean;
}

export interface EvaluationActions {
  runEvaluation: ActionState;
  cancelRun: ActionState;
}

export function deriveEvaluationActions(state: EvaluationState): EvaluationActions {
  return {
    runEvaluation: state.isRunning ? disabled("An evaluation is already running") : enabled(),
    cancelRun: state.isRunning ? enabled() : HIDDEN,
  };
}
