// "Session lost (worker restart): the next turn starts a fresh session
// with a handover note built from the stored turns" (SYSTEM-DESIGN.md §10)
// - the week-5 resume brief, adapted. Appended to the system prompt so the
// caller doesn't have to repeat themselves.
export interface PriorTurn {
  user_transcript: string;
  assistant_response: string;
}

const MAX_TURNS_IN_NOTE = 5;

export function buildHandoverNote(turns: PriorTurn[]): string {
  if (turns.length === 0) return "";
  const recent = turns.slice(-MAX_TURNS_IN_NOTE);
  const lines = recent.map((t) => `Caller: ${t.user_transcript}\nYou: ${t.assistant_response}`).join("\n\n");
  return `\n\n## Resuming a call in progress\n\nThe connection for this call was lost and has just reconnected - this is a continuation, not a new call. Do not greet the caller again or re-ask anything already covered below.\n\n${lines}`;
}
