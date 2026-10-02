import { describe, expect, it } from "vitest";
import { CALLBACK_SLOT_MINUTES, CALLBACK_TIME_ZONE, formatCallbackSlot, hasExplicitTimePeriod, validateCallbackSlot } from "@core/mcp";

const NOW = new Date("2026-10-02T12:00:00+01:00");

describe("callback policy", () => {
  it.each([
    ["tomorrow by 2", false],
    ["Monday at 2 PM", true],
    ["Monday at 2pm", true],
    ["Monday at 2 p.m.", true],
    ["Monday at 14:00", true],
    ["Monday at noon", true],
  ])("detects whether the caller made the time period explicit in %j", (source, expected) => {
    expect(hasExplicitTimePeriod(source)).toBe(expected);
  });

  it("accepts a 30-minute weekday slot ending at 3pm WAT", () => {
    expect(validateCallbackSlot("2026-10-05T14:30:00+01:00", NOW)).toEqual({
      ok: true,
      startIso: "2026-10-05T13:30:00.000Z",
      endIso: "2026-10-05T14:00:00.000Z",
    });
    expect(CALLBACK_SLOT_MINUTES).toBe(30);
    expect(CALLBACK_TIME_ZONE).toBe("Africa/Lagos");
  });

  it.each([
    ["2026-10-05T14:31:00+01:00", "outside_business_hours"],
    ["2026-10-05T08:59:00+01:00", "outside_business_hours"],
    ["2026-10-05T15:00:00+01:00", "outside_business_hours"],
    ["2026-10-03T10:00:00+01:00", "weekend"],
    ["2026-10-02T11:59:00+01:00", "past_time"],
    ["next Monday at two", "invalid_time"],
    ["2026-10-05T14:00:00", "invalid_time"],
  ] as const)("refuses %s as %s", (startIso, reason) => {
    expect(validateCallbackSlot(startIso, NOW)).toEqual({ ok: false, reason });
  });

  it("formats the complete agreed slot in WAT", () => {
    expect(formatCallbackSlot("2026-10-05T14:00:00+01:00")).toBe("Monday, October 5 at 2:00 PM WAT");
  });
});
