// The category vocabulary escalation-rules.md defines for escalations
// ("compliance, account, dispute, payment, or other"). support_tickets has
// no separate vocabulary of its own anywhere in the PRD's assets
// (migration 003's comment already flags this gap for `priority`) - reused
// here for ticket categories too, rather than inventing an unrelated
// second list.
export const CATEGORIES = ["compliance", "account", "dispute", "payment", "other"] as const;
export type Category = (typeof CATEGORIES)[number];

export const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}

export function isPriority(value: string): value is Priority {
  return (PRIORITIES as readonly string[]).includes(value);
}
