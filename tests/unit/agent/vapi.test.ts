import { describe, expect, it } from "vitest";
import { formatChatCompletionChunk, newUserMessage, parseChatCompletionsBody, parseVapiEventBody, SSE_DONE, VAPI_START_SPEAKING_PLAN } from "@core/agent/vapi";

it("uses LiveKit smart endpointing with a fast 0.4 second minimum wait", () => {
  expect(VAPI_START_SPEAKING_PLAN).toMatchObject({ waitSeconds: 0.4, smartEndpointingPlan: { provider: "livekit" } });
});

describe("parseChatCompletionsBody", () => {
  it("parses a real Vapi custom-llm request shape (call.assistantOverrides.metadata - verified against a real live call, Task 13)", () => {
    const body = {
      model: "claude-haiku-4-5",
      messages: [
        { role: "system", content: "You are..." },
        { role: "user", content: "What are your fees?" },
      ],
      call: { assistantOverrides: { metadata: { conversation_id: "conv-1", token: "tok-1" } } },
      stream: true,
    };
    const parsed = parseChatCompletionsBody(body);
    expect(parsed).toEqual({ conversationId: "conv-1", token: "tok-1", model: "claude-haiku-4-5", effort: undefined, userMessages: ["What are your fees?"] });
  });

  it("falls back to a top-level metadata field (not what a real Vapi call sends, but kept for a direct/test caller)", () => {
    const body = {
      messages: [{ role: "user", content: "hi" }],
      metadata: { conversation_id: "conv-1", token: "tok-1" },
    };
    expect(parseChatCompletionsBody(body)).toMatchObject({ conversationId: "conv-1", token: "tok-1" });
  });

  it("collects every user message across a longer history, in order", () => {
    const body = {
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "first" },
        { role: "assistant", content: "reply" },
        { role: "user", content: "second" },
      ],
      metadata: { conversation_id: "conv-1", token: "tok-1" },
    };
    expect(parseChatCompletionsBody(body)?.userMessages).toEqual(["first", "second"]);
  });

  it("returns null when metadata.conversation_id is missing", () => {
    expect(parseChatCompletionsBody({ messages: [], metadata: { token: "tok-1" } })).toBeNull();
  });

  it("returns null when metadata.token is missing", () => {
    expect(parseChatCompletionsBody({ messages: [], metadata: { conversation_id: "conv-1" } })).toBeNull();
  });

  it("returns null for a non-object body", () => {
    expect(parseChatCompletionsBody(null)).toBeNull();
    expect(parseChatCompletionsBody("a string")).toBeNull();
  });
});

describe("newUserMessage", () => {
  it("returns null when this request has no more user messages than are already recorded (a resend)", () => {
    expect(newUserMessage(["first"], 1)).toBeNull();
  });

  it("returns the newest user message when there's exactly one more than recorded", () => {
    expect(newUserMessage(["first", "second"], 1)).toBe("second");
  });

  it("returns the newest message when nothing is recorded yet", () => {
    expect(newUserMessage(["first"], 0)).toBe("first");
  });
});

describe("formatChatCompletionChunk / SSE_DONE", () => {
  it("formats an OpenAI-shaped chat.completion.chunk SSE event", () => {
    const chunk = formatChatCompletionChunk("Hello", { id: "turn-1", model: "claude-haiku-4-5" });
    expect(chunk.startsWith("data: ")).toBe(true);
    expect(chunk.endsWith("\n\n")).toBe(true);
    const parsed = JSON.parse(chunk.slice("data: ".length).trim());
    expect(parsed).toMatchObject({ id: "turn-1", object: "chat.completion.chunk", model: "claude-haiku-4-5", choices: [{ index: 0, delta: { content: "Hello" }, finish_reason: null }] });
  });

  it("SSE_DONE is the literal Vapi/OpenAI-style sentinel", () => {
    expect(SSE_DONE).toBe("data: [DONE]\n\n");
  });
});

describe("parseVapiEventBody", () => {
  it("parses a real end-of-call-report payload (call.assistantOverrides.metadata - verified against a real live call, Task 13)", () => {
    const body = {
      message: {
        type: "end-of-call-report",
        endedReason: "customer-ended-call",
        call: { id: "vapi-call-1", assistantOverrides: { metadata: { conversation_id: "conv-1" } }, analysis: { summary: "Caller asked about fees." } },
        artifact: { transcript: "AI: Hi. User: What are your fees?" },
      },
    };
    expect(parseVapiEventBody(body)).toEqual({
      type: "end-of-call-report",
      callId: "vapi-call-1",
      conversationId: "conv-1",
      endedReason: "customer-ended-call",
      summary: "Caller asked about fees.",
      transcript: "AI: Hi. User: What are your fees?",
      latency: null,
    });
  });

  it("reads Vapi's latency averages from artifact.performanceMetrics, rounded to whole milliseconds", () => {
    const performanceMetrics = { turnLatencies: [{}, {}], turnLatencyAverage: 1830.4, endpointingLatencyAverage: 610, transcriberLatencyAverage: 240.6, modelLatencyAverage: 720, voiceLatencyAverage: 260, numUserInterrupted: 0, numAssistantInterrupted: 1 };
    const body = { message: { type: "end-of-call-report", endedReason: "hangup", call: { id: "c1", assistantOverrides: { metadata: { conversation_id: "conv-1" } } }, artifact: { performanceMetrics } } };
    expect(parseVapiEventBody(body)).toMatchObject({
      latency: { turns: 2, turn_ms: 1830, endpointing_ms: 610, transcriber_ms: 241, model_ms: 720, voice_ms: 260, caller_interrupted_agent: 1, agent_interrupted_caller: 0 },
    });
  });

  it("falls back to call.metadata (not what a real Vapi call sends, but kept for resilience)", () => {
    const body = { message: { type: "hang", call: { id: "c1", metadata: { conversation_id: "conv-1" } } } };
    expect(parseVapiEventBody(body)).toMatchObject({ conversationId: "conv-1" });
  });

  it("falls back to a null summary when analysis hasn't been generated yet", () => {
    const body = { message: { type: "end-of-call-report", endedReason: "hangup", call: { id: "c1", assistantOverrides: { metadata: { conversation_id: "conv-1" } } } } };
    expect(parseVapiEventBody(body)).toMatchObject({ type: "end-of-call-report", summary: null });
  });

  it("parses a status-update payload", () => {
    const body = { message: { type: "status-update", call: { id: "vapi-call-1", assistantOverrides: { metadata: { conversation_id: "conv-1" } } }, status: "in-progress" } };
    expect(parseVapiEventBody(body)).toEqual({ type: "status-update", callId: "vapi-call-1", conversationId: "conv-1", status: "in-progress" });
  });

  it("parses a hang payload", () => {
    const body = { message: { type: "hang", call: { id: "vapi-call-1", assistantOverrides: { metadata: { conversation_id: "conv-1" } } } } };
    expect(parseVapiEventBody(body)).toEqual({ type: "hang", callId: "vapi-call-1", conversationId: "conv-1" });
  });

  it("returns null for an unrecognised message type", () => {
    const body = { message: { type: "speech-update", call: { id: "c1" } } };
    expect(parseVapiEventBody(body)).toBeNull();
  });

  it("returns null for a malformed body", () => {
    expect(parseVapiEventBody({})).toBeNull();
    expect(parseVapiEventBody(null)).toBeNull();
  });
});
