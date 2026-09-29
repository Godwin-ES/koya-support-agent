// The action state contract (SYSTEM-DESIGN.md §11.4-11.5): "an action
// that can't apply in this state is hidden. An action that could apply,
// but not right now, is disabled with a reason." One pure function per
// object computes each action's state - both the UI and the server call
// it, so the UI never offers what the server would refuse. `label` is an
// optional override for the control's idle-state text (the same "enabled"
// state reads "Start call" in one row and "Try again" or "Call again" in
// another, per §11.5's own table).
export type ActionState = { kind: "enabled"; label?: string } | { kind: "disabled"; reason: string; label?: string } | { kind: "hidden" };

export const ENABLED: ActionState = { kind: "enabled" };
export const HIDDEN: ActionState = { kind: "hidden" };

export function enabled(label?: string): ActionState {
  return label ? { kind: "enabled", label } : ENABLED;
}

export function disabled(reason: string, label?: string): ActionState {
  return label ? { kind: "disabled", reason, label } : { kind: "disabled", reason };
}
