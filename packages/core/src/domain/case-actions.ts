// deriveCaseActions (SYSTEM-DESIGN.md §11.5) - the console queue's Start
// working / Close / Reopen controls for a ticket or escalation. "Close"
// and "Run evaluation" ask first (§11.4) - that's the confirm dialog the
// component wires onto the button, not something ActionState encodes.
import { enabled, HIDDEN, type ActionState } from "./action-state";

export type CaseStatus = "open" | "in_progress" | "closed";

export interface CaseActions {
  startWorking: ActionState;
  close: ActionState;
  reopen: ActionState;
}

export function deriveCaseActions(status: CaseStatus): CaseActions {
  switch (status) {
    case "open":
      return { startWorking: enabled(), close: enabled(), reopen: HIDDEN };
    case "in_progress":
      return { startWorking: HIDDEN, close: enabled(), reopen: HIDDEN };
    case "closed":
      return { startWorking: HIDDEN, close: HIDDEN, reopen: enabled() };
  }
}
