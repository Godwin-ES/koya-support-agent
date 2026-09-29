// Component tests per call state (IMPLEMENTATION-PLAN.md Task 10) - the
// voice page rendered under every SYSTEM-DESIGN.md §11.5 state, asserting
// exactly the controls deriveCallActions specifies for it. `useVoiceCall`
// is mocked so each state is driven directly, not through a real Vapi call.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { CallState } from "@core/domain/call-actions";
import { deriveCallActions } from "@core/domain/call-actions";
import type { EndOfCallSummary, TranscriptTurn } from "@/lib/use-voice-call";

const mockUseVoiceCall = vi.fn();
vi.mock("@/lib/use-voice-call", () => ({ useVoiceCall: () => mockUseVoiceCall() }));
vi.mock("@/lib/use-call-limit", () => ({ useCallLimit: () => null }));

interface HookValue {
  callState: CallState;
  callerText: string;
  agentText: string;
  fullTranscript: TranscriptTurn[];
  endOfCallSummary: EndOfCallSummary | null;
  remainingSeconds: number | null;
  startCall: () => void;
  endCall: () => void;
}

async function renderAtState(callState: CallState, overrides: Partial<HookValue> = {}) {
  mockUseVoiceCall.mockReturnValue({ ...baseHookValue(callState), ...overrides });
  const { default: VoicePage } = await import("@/app/page");
  return render(<VoicePage />);
}

function baseHookValue(callState: CallState): HookValue {
  return {
    callState,
    callerText: "",
    agentText: "",
    fullTranscript: [],
    endOfCallSummary: null,
    remainingSeconds: null,
    startCall: vi.fn(),
    endCall: vi.fn(),
  };
}

const STATES: CallState[] = ["idle", "requesting", "connecting", "listening", "agent_speaking", "ending", "ended", "mic_blocked", "limit_reached", "busy", "unavailable", "dropped"];

// Every label deriveCallActions can produce for each slot (§11.5's table -
// the visible label changes per state, e.g. "Start call" vs "Try again",
// so matching has to know the whole vocabulary, not just the idle label).
const START_LABELS = [/^start call$/i, /^connecting…$/i, /^start a new call$/i, /^try again$/i, /^call again$/i];
const END_LABELS = [/^end call$/i, /^ending…$/i];

function findButtonByLabels(patterns: RegExp[]): HTMLElement | null {
  return screen.queryAllByRole("button").find((button) => patterns.some((p) => p.test(button.textContent ?? ""))) ?? null;
}

describe.each(STATES)("voice page in call state '%s'", (state) => {
  it("shows exactly the enabled/disabled/hidden controls deriveCallActions specifies", async () => {
    vi.resetModules();
    await renderAtState(state, state === "ended" ? { endOfCallSummary: { followUpSummary: null, endedDueToSilence: false } } : {});
    const actions = deriveCallActions(state);

    const startButton = findButtonByLabels(START_LABELS);
    if (actions.startCall.kind === "hidden") {
      expect(startButton).toBeNull();
    } else {
      expect(startButton).not.toBeNull();
      expect(startButton).toHaveProperty("disabled", actions.startCall.kind === "disabled");
    }

    const endButton = findButtonByLabels(END_LABELS);
    if (actions.endCall.kind === "hidden") {
      expect(endButton).toBeNull();
    } else {
      expect(endButton).not.toBeNull();
      expect(endButton).toHaveProperty("disabled", actions.endCall.kind === "disabled");
    }

    const typeInsteadButton = screen.queryByRole("button", { name: "Type instead" });
    expect(typeInsteadButton).not.toBeNull();
    expect(typeInsteadButton).toHaveProperty("disabled", actions.typeInstead.kind === "disabled");
    if (actions.typeInstead.kind === "disabled") {
      expect(typeInsteadButton).toHaveAccessibleDescription(actions.typeInstead.reason);
    }
  });
});

describe("voice page - mic_blocked, limit_reached, busy and unavailable each render their message and one way forward", () => {
  it("mic_blocked suggests typing instead, enabled", async () => {
    vi.resetModules();
    await renderAtState("mic_blocked");
    expect(screen.getAllByText(/allow microphone access/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Type instead" })).not.toBeDisabled();
  });

  it("limit_reached explains the limit and disables both start and type instead", async () => {
    vi.resetModules();
    await renderAtState("limit_reached");
    expect(screen.getByText(/today's call limit/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Type instead" })).toBeDisabled();
  });

  it("busy explains all agents are busy, with Start call still available to retry", async () => {
    vi.resetModules();
    await renderAtState("busy");
    expect(screen.getByText(/all our agents are busy/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).not.toBeDisabled();
  });

  it("unavailable explains support is down, with Start call still available to retry", async () => {
    vi.resetModules();
    await renderAtState("unavailable");
    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).not.toBeDisabled();
  });
});

describe("voice page - end-of-call summary", () => {
  it("shows the tool's follow_up_summary when one was captured", async () => {
    vi.resetModules();
    await renderAtState("ended", { endOfCallSummary: { followUpSummary: "A specialist will call you back tomorrow morning.", endedDueToSilence: false } });
    expect(screen.getByText("A specialist will call you back tomorrow morning.")).toBeInTheDocument();
  });

  it("falls back to the generic thank-you when no ticket or escalation was created", async () => {
    vi.resetModules();
    await renderAtState("ended", { endOfCallSummary: { followUpSummary: null, endedDueToSilence: false } });
    expect(screen.getByText(/thanks for calling/i)).toBeInTheDocument();
  });

  it("names the 30-second silence timeout when that's why the call ended (SYSTEM-DESIGN.md §9 - enforced client-side, Vapi has no such field itself)", async () => {
    vi.resetModules();
    await renderAtState("ended", { endOfCallSummary: { followUpSummary: null, endedDueToSilence: true } });
    expect(screen.getByText(/30 seconds of silence/i)).toBeInTheDocument();
  });
});

describe("voice page - the 5-minute countdown", () => {
  it("shows the remaining time while the call is active", async () => {
    vi.resetModules();
    await renderAtState("listening", { remainingSeconds: 125 });
    expect(screen.getByText("2:05 remaining")).toBeInTheDocument();
  });

  it("shows nothing before a call has started", async () => {
    vi.resetModules();
    await renderAtState("idle", { remainingSeconds: null });
    expect(screen.queryByText(/remaining/i)).not.toBeInTheDocument();
  });
});
