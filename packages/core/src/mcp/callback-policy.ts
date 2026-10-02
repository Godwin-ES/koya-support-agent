export const CALLBACK_TIME_ZONE = "Africa/Lagos";
export const CALLBACK_SLOT_MINUTES = 30;

export type CallbackSlotRefusalReason = "invalid_time" | "past_time" | "weekend" | "outside_business_hours";
export type CallbackSlotValidation =
  | { ok: true; startIso: string; endIso: string }
  | { ok: false; reason: CallbackSlotRefusalReason };

const OFFSET_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const WEEKDAYS = new Set(["Mon", "Tue", "Wed", "Thu", "Fri"]);

function localParts(date: Date): { weekday: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CALLBACK_TIME_ZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return { weekday: value("weekday"), minutes: Number(value("hour")) * 60 + Number(value("minute")) };
}

export function validateCallbackSlot(startIso: string, now: Date = new Date()): CallbackSlotValidation {
  if (!OFFSET_ISO.test(startIso)) return { ok: false, reason: "invalid_time" };
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return { ok: false, reason: "invalid_time" };
  if (start.getTime() <= now.getTime()) return { ok: false, reason: "past_time" };

  const local = localParts(start);
  if (!WEEKDAYS.has(local.weekday)) return { ok: false, reason: "weekend" };
  const opensAt = 9 * 60;
  const closesAt = 15 * 60;
  if (local.minutes < opensAt || local.minutes + CALLBACK_SLOT_MINUTES > closesAt) {
    return { ok: false, reason: "outside_business_hours" };
  }

  return {
    ok: true,
    startIso: start.toISOString(),
    endIso: new Date(start.getTime() + CALLBACK_SLOT_MINUTES * 60_000).toISOString(),
  };
}

export function formatCallbackSlot(startIso: string): string {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return startIso;
  return `${new Intl.DateTimeFormat("en-US", {
    timeZone: CALLBACK_TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(start)} WAT`;
}
