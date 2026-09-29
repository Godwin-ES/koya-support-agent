// The stream filter (SYSTEM-DESIGN.md §4): "strips anything that slips
// through (*, #, bullets, links) before Vapi speaks it" and "never speaks
// an email address the caller didn't give in this conversation, or
// internal note text." The system prompt already asks the model for plain
// spoken sentences and never to repeat an internal note - this is the
// code-level backstop for when it slips anyway.
//
// Markdown can slip in in pieces across separate stream deltas ("**" in one
// chunk, "bold" in the next, "**" in a third) - VoiceStreamFilter buffers a
// small tail and only emits text once no formatting marker could still be
// completing at the boundary, so a chunk boundary can't split "**bold**"
// into a literal, unstripped "**".

const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
// A sentence-ending "." right after the email (no space) matches the regex
// above too - trimmed off separately rather than excluded from the regex,
// since a real domain can itself contain dots ("lagosledger.example").
const TRAILING_PUNCTUATION_RE = /[.,!?;:)]+$/;

function trimTrailingPunctuation(email: string): string {
  return email.replace(TRAILING_PUNCTUATION_RE, "");
}

/** Strips the markdown SYSTEM-DESIGN.md §4 names: emphasis, headings, bullets, links, code fences. */
export function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```/g, "").trim()) // fenced code -> plain text
    .replace(/`([^`]+)`/g, "$1") // inline code
    .replace(/^#{1,6}\s+/gm, "") // headings
    .replace(/^\s*[-*+]\s+/gm, "") // bullets
    .replace(/^\s*\d+\.\s+/gm, "") // numbered lists
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1") // links -> just the text
    .replace(/(\*\*|__)(.*?)\1/g, "$2") // bold
    .replace(/(\*|_)(.*?)\1/g, "$2"); // italic
}

/** Replaces any email address not in `allowedEmails` (case-insensitive) with a neutral phrase. */
export function redactUnknownEmails(text: string, allowedEmails: ReadonlySet<string>): string {
  return text.replace(EMAIL_RE, (match) => {
    const email = trimTrailingPunctuation(match);
    if (allowedEmails.has(email.toLowerCase())) return match;
    const trailing = match.slice(email.length);
    return `the email address on file${trailing}`;
  });
}

/** Every email address mentioned in caller speech, for the allowlist redactUnknownEmails needs. */
export function extractEmails(text: string): string[] {
  return [...text.matchAll(EMAIL_RE)].map((m) => trimTrailingPunctuation(m[0]).toLowerCase());
}

// A run of markdown-sensitive characters at the very end of the buffered
// text might be the start of a marker that's still completing - held back
// until more text confirms or disproves it. Generous enough to cover the
// longest markers above (``` and ** two chars, [text](url) needs the whole
// closing paren).
const TAIL_HOLDBACK = 40;

export class VoiceStreamFilter {
  private buffer = "";
  private readonly allowedEmails: Set<string>;

  constructor(allowedEmails: Iterable<string> = []) {
    this.allowedEmails = new Set([...allowedEmails].map((e) => e.toLowerCase()));
  }

  allowEmail(email: string): void {
    this.allowedEmails.add(email.toLowerCase());
  }

  /** Feeds one stream delta, returning the portion now safe to speak (possibly empty). */
  push(delta: string): string {
    this.buffer += delta;
    if (this.buffer.length <= TAIL_HOLDBACK) return "";
    const safeLength = this.buffer.length - TAIL_HOLDBACK;
    const safe = this.buffer.slice(0, safeLength);
    this.buffer = this.buffer.slice(safeLength);
    return redactUnknownEmails(stripMarkdown(safe), this.allowedEmails);
  }

  /** Call once the turn's stream ends - flushes whatever's left in the holdback buffer. */
  flush(): string {
    const rest = this.buffer;
    this.buffer = "";
    return redactUnknownEmails(stripMarkdown(rest), this.allowedEmails);
  }
}
