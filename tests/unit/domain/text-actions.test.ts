import { describe, expect, it } from "vitest";
import { deriveTextActions } from "@core/domain/text-actions";

describe("deriveTextActions", () => {
  it("send is disabled with 'Type a message' when the draft is empty", () => {
    const a = deriveTextActions({ draftIsEmpty: true, isStreaming: false, hasSentAMessage: false });
    expect(a.send).toEqual({ kind: "disabled", reason: "Type a message" });
  });

  it("send is disabled with 'Waiting for the reply' while streaming, even with a draft", () => {
    const a = deriveTextActions({ draftIsEmpty: false, isStreaming: true, hasSentAMessage: true });
    expect(a.send).toEqual({ kind: "disabled", reason: "Waiting for the reply" });
  });

  it("send is enabled once there's a draft and nothing is streaming", () => {
    const a = deriveTextActions({ draftIsEmpty: false, isStreaming: false, hasSentAMessage: false });
    expect(a.send).toEqual({ kind: "enabled" });
  });

  it("switch to voice is disabled while a reply streams", () => {
    const a = deriveTextActions({ draftIsEmpty: true, isStreaming: true, hasSentAMessage: false });
    expect(a.switchToVoice.kind).toBe("disabled");
  });

  it("switch to voice is enabled once nothing is streaming", () => {
    const a = deriveTextActions({ draftIsEmpty: true, isStreaming: false, hasSentAMessage: false });
    expect(a.switchToVoice).toEqual({ kind: "enabled" });
  });

  it("end conversation is disabled until a message has been sent", () => {
    const a = deriveTextActions({ draftIsEmpty: true, isStreaming: false, hasSentAMessage: false });
    expect(a.endConversation.kind).toBe("disabled");
  });

  it("end conversation is enabled once a message has been sent", () => {
    const a = deriveTextActions({ draftIsEmpty: true, isStreaming: false, hasSentAMessage: true });
    expect(a.endConversation).toEqual({ kind: "enabled" });
  });
});
