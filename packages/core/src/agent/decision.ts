// The decision record (SYSTEM-DESIGN.md §4): the agent is asked to declare
// its own path via log_conversation_event before replying; if it doesn't,
// the server infers one from what happened this turn and marks it
// `inferred`, so conversation_turns.answer_type is never empty.
export type AnswerType = "answer" | "clarify" | "escalate" | "decline";

// A declared decision comes from parsing a live model's tool call input
// (session.ts) - `answer_type` is typed as `AnswerType` for callers, but
// nothing enforces that a model actually sends one of the four values at
// runtime. It doesn't reliably: a live Haiku run declared "general_info",
// which conversation_turns' own CHECK constraint (rightly) rejects -
// caught only because that insert started failing silently forever (fixed
// alongside this: RetryBuffer now logs a failed write instead of just
// buffering it quietly). `decideTurn` validates below rather than trusting
// the type.
export const VALID_ANSWER_TYPES: readonly AnswerType[] = ["answer", "clarify", "escalate", "decline"];

export interface DeclaredDecision {
  answer_type: AnswerType;
  confidence?: number;
  knowledge_chunk_ids?: string[];
}

export interface ToolCallActivity {
  name: string;
  status: "ok" | "not_found" | "refused" | "error";
}

export interface TurnActivity {
  toolCalls: ToolCallActivity[];
  declared?: DeclaredDecision;
}

export interface DecisionRecord {
  answer_type: AnswerType;
  confidence: number | null;
  confidence_note: string | null;
  inferred: boolean;
  knowledge_chunk_ids: string[];
}

const LOOKUP_TOOLS = new Set(["lookup_customer", "lookup_transaction", "lookup_payout", "list_account_activity"]);

/**
 * Inference order, most certain signal first: an escalation actually
 * created outranks everything else (SYSTEM-DESIGN.md §4's own example).
 * Next, a lookup or a knowledge search that found something means an
 * answer - a lookup summary read back to the caller is as much "answer
 * from an approved source" as a knowledge-base chunk is. Then a knowledge
 * search that came back empty means a decline (nothing approved to answer
 * from). With no signal either way - no lookup, no search, no escalation -
 * "clarify" is the fallback: the least presumptuous reading of a turn that
 * neither answered from a source nor escalated. (A lookup that came back
 * not_found also falls to this default, on purpose: the caller most likely
 * needs to repeat or correct a reference, which is what "clarify" is for -
 * "decline" is reserved for "no approved information covers this at all".)
 */
export function decideTurn(activity: TurnActivity): DecisionRecord {
  if (activity.declared && (VALID_ANSWER_TYPES as string[]).includes(activity.declared.answer_type)) {
    return {
      answer_type: activity.declared.answer_type,
      confidence: activity.declared.confidence ?? null,
      confidence_note: null,
      inferred: false,
      knowledge_chunk_ids: activity.declared.knowledge_chunk_ids ?? [],
    };
  }

  const invalidDeclaration = activity.declared && !(VALID_ANSWER_TYPES as string[]).includes(activity.declared.answer_type) ? activity.declared.answer_type : null;

  const escalated = activity.toolCalls.some((c) => c.name === "create_escalation" && c.status === "ok");
  const foundLookup = activity.toolCalls.some((c) => LOOKUP_TOOLS.has(c.name) && c.status === "ok");
  const knowledgeCall = activity.toolCalls.find((c) => c.name === "search_knowledge");

  let answer_type: AnswerType;
  if (escalated) answer_type = "escalate";
  else if (foundLookup || knowledgeCall?.status === "ok") answer_type = "answer";
  else if (knowledgeCall) answer_type = "decline";
  else answer_type = "clarify";

  return {
    answer_type,
    confidence: null,
    confidence_note: invalidDeclaration
      ? `inferred from tool activity - the agent declared an invalid answer_type ("${invalidDeclaration}")`
      : "inferred from tool activity - the agent did not declare a decision this turn",
    inferred: true,
    knowledge_chunk_ids: [],
  };
}
