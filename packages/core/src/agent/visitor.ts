// The hashed visitor id (SYSTEM-DESIGN.md §7 conversations.caller_ref, §9:
// "per visitor (hashed IP plus a browser id)") - never a raw IP stored.
// `browserId` is a random id the voice page generates and persists in
// localStorage (Task 10) and sends with POST /api/conversations; without
// one, the hash falls back to IP alone (a visitor with cookies/storage
// blocked still gets a real, if coarser, limit).
import { createHash } from "node:crypto";

export function hashVisitor(salt: string, ip: string, browserId?: string): string {
  return createHash("sha256")
    .update(`${salt}|${ip}|${browserId ?? ""}`)
    .digest("hex");
}
