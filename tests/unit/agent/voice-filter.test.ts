import { describe, expect, it } from "vitest";
import { extractEmails, redactUnknownEmails, stripMarkdown, VoiceStreamFilter } from "@core/agent/voice-filter";

describe("stripMarkdown", () => {
  it("strips bold and italic emphasis, keeping the text", () => {
    expect(stripMarkdown("This is **bold** and this is *italic*.")).toBe("This is bold and this is italic.");
  });

  it("strips headings", () => {
    expect(stripMarkdown("# A heading\nBody text")).toBe("A heading\nBody text");
  });

  it("strips bullet and numbered list markers", () => {
    expect(stripMarkdown("- one\n- two\n1. three")).toBe("one\ntwo\nthree");
  });

  it("strips links, keeping only the link text", () => {
    expect(stripMarkdown("See [our fees](https://relaypay.example/fees) for details.")).toBe("See our fees for details.");
  });

  it("strips inline and fenced code", () => {
    expect(stripMarkdown("Run `pnpm test` or:\n```\npnpm test\n```")).toBe("Run pnpm test or:\npnpm test");
  });

  it("leaves plain spoken sentences untouched", () => {
    const text = "Fees depend on the corridor, currency, and payment method.";
    expect(stripMarkdown(text)).toBe(text);
  });
});

describe("redactUnknownEmails", () => {
  it("redacts an email the caller never gave this conversation", () => {
    const result = redactUnknownEmails("I'll send that to amara@lagosledger.example.", new Set());
    expect(result).not.toContain("amara@lagosledger.example");
  });

  it("keeps an email the caller did give", () => {
    const result = redactUnknownEmails("I'll follow up at amara@lagosledger.example.", new Set(["amara@lagosledger.example"]));
    expect(result).toContain("amara@lagosledger.example");
  });

  it("is case-insensitive", () => {
    const result = redactUnknownEmails("Confirming AMARA@lagosledger.example.", new Set(["amara@lagosledger.example"]));
    expect(result).toContain("AMARA@lagosledger.example");
  });
});

describe("extractEmails", () => {
  it("finds every email mentioned, lowercased", () => {
    expect(extractEmails("Reach me at Amara@LagosLedger.example or backup@example.com.")).toEqual(["amara@lagosledger.example", "backup@example.com"]);
  });

  it("returns nothing for text with no email", () => {
    expect(extractEmails("What are your fees?")).toEqual([]);
  });
});

describe("VoiceStreamFilter", () => {
  it("strips markdown split across multiple stream deltas", () => {
    const filter = new VoiceStreamFilter();
    let out = "";
    for (const delta of ["This is **", "bold", "** text and more plain words to push the marker out of the holdback window."]) {
      out += filter.push(delta);
    }
    out += filter.flush();
    expect(out).toBe("This is bold text and more plain words to push the marker out of the holdback window.");
  });

  it("redacts an unlisted email even when it arrives split across deltas", () => {
    const filter = new VoiceStreamFilter();
    let out = "";
    for (const delta of ["Email me at amara@", "lagosledger.example", " and I'll follow up soon, thanks for calling RelayPay support today."]) {
      out += filter.push(delta);
    }
    out += filter.flush();
    expect(out).not.toContain("amara@lagosledger.example");
  });

  it("allowEmail lets a caller-given email through mid-stream", () => {
    const filter = new VoiceStreamFilter();
    filter.allowEmail("amara@lagosledger.example");
    let out = "";
    for (const delta of ["Confirming amara@", "lagosledger.example", " is the email on file, thanks for calling."]) {
      out += filter.push(delta);
    }
    out += filter.flush();
    expect(out).toContain("amara@lagosledger.example");
  });

  it("flush returns nothing extra when the buffer is already empty", () => {
    const filter = new VoiceStreamFilter();
    filter.push("short");
    filter.flush();
    expect(filter.flush()).toBe("");
  });
});
