// deriveTextActions (SYSTEM-DESIGN.md §11.5) - the text fallback's Send,
// Switch to voice and End conversation controls.
import { disabled, enabled, type ActionState } from "./action-state";

export interface TextState {
  draftIsEmpty: boolean;
  isStreaming: boolean;
  hasSentAMessage: boolean;
}

export interface TextActions {
  send: ActionState;
  switchToVoice: ActionState;
  endConversation: ActionState;
}

export function deriveTextActions(state: TextState): TextActions {
  const send = state.isStreaming ? disabled("Waiting for the reply") : state.draftIsEmpty ? disabled("Type a message") : enabled();
  const switchToVoice = state.isStreaming ? disabled("Waiting for the reply") : enabled();
  const endConversation = state.hasSentAMessage ? enabled() : disabled("Send a message first");
  return { send, switchToVoice, endConversation };
}
