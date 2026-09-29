// Normalises a spoken or loosely-typed reference ("TXN nine zero zero
// one", "txn 9001", "9001") into the seed data's own id format:
// `<PREFIX>-<digits>` (SYSTEM-DESIGN.md §5's own example: "TXN nine zero
// zero one" -> "TXN-9001").
const NUMBER_WORDS: Record<string, string> = {
  zero: "0",
  oh: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
};

const PREFIX_WORDS: Record<string, string> = {
  transaction: "TXN",
  txn: "TXN",
  payout: "PAY",
  pay: "PAY",
  customer: "CUS",
  cus: "CUS",
};

/** Normalises one reference against a known prefix (e.g. "TXN", "PAY"). */
export function normalizeReference(defaultPrefix: string, raw: string): string {
  const words = raw
    .trim()
    .toLowerCase()
    .split(/[\s-]+/)
    .filter(Boolean);

  let prefix = defaultPrefix.toUpperCase();
  const digits: string[] = [];

  for (const word of words) {
    if (PREFIX_WORDS[word]) {
      prefix = PREFIX_WORDS[word];
      continue;
    }
    if (NUMBER_WORDS[word] !== undefined) {
      digits.push(NUMBER_WORDS[word]);
      continue;
    }
    // A mixed token like "txn9001" or "9001" - split into letters and digits.
    const letterMatch = /^[a-z]+/.exec(word);
    if (letterMatch && PREFIX_WORDS[letterMatch[0]]) {
      prefix = PREFIX_WORDS[letterMatch[0]];
    }
    const digitMatch = /\d+/.exec(word);
    if (digitMatch) digits.push(digitMatch[0]);
  }

  return digits.length > 0 ? `${prefix}-${digits.join("")}` : raw.trim().toUpperCase();
}
