// One way to show a time, everywhere a person reads one (console, customer
// app, Discord). Servers run on UTC, so a bare toLocaleString() rendered on
// the server showed every console time an hour behind West Africa Time, with
// no zone to say so. RelayPay's team and customers work in WAT - the same
// zone the agent assumes for a spoken callback time - so times are shown in
// it, labelled.
const ZONE = "Africa/Lagos";

const PARTS = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const TIME = new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const DAY = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/** "Tue 30 Sep, 18:51 WAT" */
export function formatDateTime(iso: string): string {
  const p = Object.fromEntries(PARTS.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.weekday} ${p.day} ${p.month}, ${p.hour}:${p.minute} WAT`;
}

/** "18:51 WAT" */
export function formatTime(iso: string): string {
  return `${TIME.format(new Date(iso))} WAT`;
}

/** The WAT calendar day, "2026-09-30" - for "is this today?" checks. */
export function watDay(date: Date | string): string {
  return DAY.format(new Date(date));
}

/** "3m 12s", "45s" */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}
