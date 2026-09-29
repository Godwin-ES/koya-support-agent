/** A short, readable case reference for customers and staff - the record's own id, shortened (e.g. ESC-1A2B3C4D). Shown on the end-of-call card and in the console queue, so a customer quoting one can be matched to the case. */
export function caseReference(kind: "escalation" | "ticket", id: string): string {
  return `${kind === "escalation" ? "ESC" : "TKT"}-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}
