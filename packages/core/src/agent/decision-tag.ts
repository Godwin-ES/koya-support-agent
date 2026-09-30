// The agent declares each turn's decision with a tag at the end of its reply,
// <decision type="answer" confidence="0.9"/>, which is taken out of the
// stream here before the caller hears or sees anything. It replaced a
// log_conversation_event tool call the agent had to make before speaking - a
// full tool round trip in front of every first word. Text is only ever held
// back while it could still be the start of a tag, so nothing is delayed.
import { VALID_ANSWER_TYPES, type AnswerType, type DeclaredDecision } from "./decision";

const OPEN = "<decision";

function parseTag(tag: string): DeclaredDecision | null {
  const type = tag.match(/type\s*=\s*["']?([a-z]+)/i)?.[1]?.toLowerCase();
  if (!type || !(VALID_ANSWER_TYPES as string[]).includes(type)) return null;
  const confidence = Number(tag.match(/confidence\s*=\s*["']?([0-9.]+)/i)?.[1]);
  return { answer_type: type as AnswerType, ...(Number.isFinite(confidence) && confidence >= 0 && confidence <= 1 ? { confidence } : {}) };
}

export class DecisionTagExtractor {
  private held = "";
  decision: DeclaredDecision | null = null;

  /** Feeds one streamed chunk; returns the text that's safe to pass on. */
  push(chunk: string): string {
    let text = this.held + chunk;
    this.held = "";
    let out = "";
    for (;;) {
      const lt = text.indexOf("<");
      if (lt === -1) return out + text;
      out += text.slice(0, lt);
      const rest = text.slice(lt);
      const couldBeTag = rest.length < OPEN.length ? OPEN.startsWith(rest.toLowerCase()) : rest.toLowerCase().startsWith(OPEN);
      if (!couldBeTag) {
        out += "<";
        text = rest.slice(1);
        continue;
      }
      const end = rest.indexOf(">");
      if (end === -1) {
        this.held = rest;
        return out;
      }
      this.decision = parseTag(rest.slice(0, end + 1)) ?? this.decision;
      text = rest.slice(end + 1);
    }
  }

  /** End of the reply: an unfinished tag is dropped, anything else passed on. */
  flush(): string {
    const held = this.held;
    this.held = "";
    return held.toLowerCase().startsWith(OPEN.slice(0, Math.min(held.length, OPEN.length))) && held.length > 0 ? "" : held;
  }
}

/** The recorded reply, without the tag. */
export function stripDecisionTags(text: string): string {
  return text.replace(/<decision\b[^>]*>/gi, "").replace(/\s+$/, "");
}
