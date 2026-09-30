import { describe, expect, it } from "vitest";
import { formatDateTime, formatDuration, formatTime, watDay } from "@core/domain/format-time";

describe("times are shown in West Africa Time, labelled", () => {
  it("converts from UTC (servers run on UTC - a bare toLocaleString showed times an hour behind)", () => {
    expect(formatDateTime("2026-09-30T17:51:00Z")).toBe("Wed 30 Sep, 18:51 WAT");
    expect(formatTime("2026-09-30T08:05:00Z")).toBe("09:05 WAT");
  });
  it("counts a late-evening UTC time as the next WAT day", () => {
    expect(watDay("2026-09-30T23:30:00Z")).toBe("2026-10-01");
  });
  it("formats durations", () => {
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(192)).toBe("3m 12s");
    expect(formatDuration(120)).toBe("2m");
  });
});
