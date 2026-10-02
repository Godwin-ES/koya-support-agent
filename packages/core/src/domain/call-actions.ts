// deriveCallActions (SYSTEM-DESIGN.md §11.5's own table, verbatim) - the
// voice page's Start call / End call / Type instead controls and status
// line, computed from the call state alone so the UI can never offer a
// control the state doesn't allow.
import { disabled, enabled, HIDDEN, type ActionState } from "./action-state";

export type CallState = "idle" | "requesting" | "connecting" | "listening" | "agent_speaking" | "ending" | "ended" | "mic_blocked" | "limit_reached" | "busy" | "unavailable" | "dropped";

export interface CallActions {
  startCall: ActionState;
  endCall: ActionState;
  typeInstead: ActionState;
  statusLine: string;
}

const CONNECTING_REASON = "Connecting a call";
const END_TO_TYPE_REASON = "End the call to type instead";

export function deriveCallActions(state: CallState): CallActions {
  switch (state) {
    case "idle":
      return { startCall: enabled(), endCall: HIDDEN, typeInstead: enabled(), statusLine: "Talk to RelayPay support" };
    case "requesting":
      return { startCall: disabled("Connecting…", "Connecting…"), endCall: enabled(), typeInstead: disabled(CONNECTING_REASON), statusLine: "Connecting…" };
    case "connecting":
      return { startCall: disabled("Connecting…", "Connecting…"), endCall: enabled(), typeInstead: disabled(CONNECTING_REASON), statusLine: "Connecting…" };
    case "listening":
      return { startCall: HIDDEN, endCall: enabled(), typeInstead: disabled(END_TO_TYPE_REASON), statusLine: "Listening" };
    case "agent_speaking":
      return { startCall: HIDDEN, endCall: enabled(), typeInstead: disabled(END_TO_TYPE_REASON), statusLine: "Speaking" };
    case "ending":
      return { startCall: HIDDEN, endCall: disabled("Ending…", "Ending…"), typeInstead: disabled("Ending the call"), statusLine: "Ending the call…" };
    case "ended":
      return { startCall: enabled("Start a new call"), endCall: HIDDEN, typeInstead: enabled(), statusLine: "Call ended" };
    case "mic_blocked":
      return { startCall: disabled("Allow microphone access to call"), endCall: HIDDEN, typeInstead: enabled(), statusLine: "Allow microphone access in your browser to call, or type instead." };
    case "limit_reached":
      return {
        startCall: disabled("Daily call limit reached. Try again tomorrow"),
        endCall: HIDDEN,
        typeInstead: disabled("Daily call limit reached. Try again tomorrow"),
        statusLine: "You've reached today's call limit. Try again tomorrow.",
      };
    case "busy":
      return { startCall: enabled("Try again"), endCall: HIDDEN, typeInstead: enabled(), statusLine: "All our agents are busy. Please try again in a minute." };
    case "unavailable":
      return { startCall: enabled("Try again"), endCall: HIDDEN, typeInstead: disabled("Support is unavailable right now"), statusLine: "Support is temporarily unavailable." };
    case "dropped":
      return { startCall: enabled("Call again"), endCall: HIDDEN, typeInstead: enabled(), statusLine: "The call dropped." };
  }
}
