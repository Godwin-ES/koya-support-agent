// Every row of SYSTEM-DESIGN.md §11.5's own call action table, verbatim.
import { describe, expect, it } from "vitest";
import { deriveCallActions, type CallState } from "@core/domain/call-actions";

describe("deriveCallActions", () => {
  it("idle: start enabled, end hidden, type instead enabled", () => {
    const a = deriveCallActions("idle");
    expect(a.startCall).toEqual({ kind: "enabled" });
    expect(a.endCall).toEqual({ kind: "hidden" });
    expect(a.typeInstead).toEqual({ kind: "enabled" });
    expect(a.statusLine).toBe("Talk to RelayPay support");
  });

  it("requesting: start disabled 'Connecting…', end hidden, type instead disabled", () => {
    const a = deriveCallActions("requesting");
    expect(a.startCall).toMatchObject({ kind: "disabled" });
    expect(a.endCall).toEqual({ kind: "hidden" });
    expect(a.typeInstead.kind).toBe("disabled");
  });

  it("connecting: start disabled, end enabled (cancels), type instead disabled", () => {
    const a = deriveCallActions("connecting");
    expect(a.startCall.kind).toBe("disabled");
    expect(a.endCall).toEqual({ kind: "enabled" });
    expect(a.typeInstead.kind).toBe("disabled");
  });

  it("listening: start hidden, end enabled, type instead disabled with the documented reason", () => {
    const a = deriveCallActions("listening");
    expect(a.startCall).toEqual({ kind: "hidden" });
    expect(a.endCall).toEqual({ kind: "enabled" });
    expect(a.typeInstead).toMatchObject({ kind: "disabled", reason: "End the call to type instead" });
  });

  it("agent_speaking: start hidden, end enabled, type instead disabled", () => {
    const a = deriveCallActions("agent_speaking");
    expect(a.startCall).toEqual({ kind: "hidden" });
    expect(a.endCall).toEqual({ kind: "enabled" });
    expect(a.typeInstead.kind).toBe("disabled");
  });

  it("ending: start hidden, end disabled 'Ending…', type instead disabled", () => {
    const a = deriveCallActions("ending");
    expect(a.startCall).toEqual({ kind: "hidden" });
    expect(a.endCall).toMatchObject({ kind: "disabled" });
    expect(a.typeInstead.kind).toBe("disabled");
  });

  it("ended: start enabled 'Start a new call', end hidden, type instead enabled", () => {
    const a = deriveCallActions("ended");
    expect(a.startCall).toEqual({ kind: "enabled", label: "Start a new call" });
    expect(a.endCall).toEqual({ kind: "hidden" });
    expect(a.typeInstead).toEqual({ kind: "enabled" });
  });

  it("mic_blocked: start disabled with the documented reason, end hidden, type instead enabled and suggested", () => {
    const a = deriveCallActions("mic_blocked");
    expect(a.startCall).toEqual({ kind: "disabled", reason: "Allow microphone access to call" });
    expect(a.endCall).toEqual({ kind: "hidden" });
    expect(a.typeInstead).toEqual({ kind: "enabled" });
  });

  it("limit_reached: start disabled, end hidden, type instead disabled with the same reason", () => {
    const a = deriveCallActions("limit_reached");
    expect(a.startCall.kind).toBe("disabled");
    expect(a.endCall).toEqual({ kind: "hidden" });
    expect(a.typeInstead.kind).toBe("disabled");
    expect((a.startCall as { reason: string }).reason).toBe((a.typeInstead as { reason: string }).reason);
  });

  it("busy: start enabled 'Try again', end hidden, type instead enabled", () => {
    const a = deriveCallActions("busy");
    expect(a.startCall).toEqual({ kind: "enabled", label: "Try again" });
    expect(a.endCall).toEqual({ kind: "hidden" });
    expect(a.typeInstead).toEqual({ kind: "enabled" });
  });

  it("unavailable: start enabled 'Try again', end hidden, type instead disabled with the documented reason", () => {
    const a = deriveCallActions("unavailable");
    expect(a.startCall).toEqual({ kind: "enabled", label: "Try again" });
    expect(a.endCall).toEqual({ kind: "hidden" });
    expect(a.typeInstead).toEqual({ kind: "disabled", reason: "Support is unavailable right now" });
  });

  it("dropped: start enabled 'Call again', end hidden, type instead enabled", () => {
    const a = deriveCallActions("dropped");
    expect(a.startCall).toEqual({ kind: "enabled", label: "Call again" });
    expect(a.endCall).toEqual({ kind: "hidden" });
    expect(a.typeInstead).toEqual({ kind: "enabled" });
  });

  it("every disabled action carries a non-empty reason", () => {
    const states: CallState[] = ["idle", "requesting", "connecting", "listening", "agent_speaking", "ending", "ended", "mic_blocked", "limit_reached", "busy", "unavailable", "dropped"];
    for (const state of states) {
      const actions = deriveCallActions(state);
      for (const action of [actions.startCall, actions.endCall, actions.typeInstead]) {
        if (action.kind === "disabled") expect(action.reason.length).toBeGreaterThan(0);
      }
    }
  });
});
