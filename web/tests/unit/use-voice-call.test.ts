// The real timer logic inside useVoiceCall (Task 13/14): the 30-second
// silence timeout (SYSTEM-DESIGN.md §9 - no Vapi field for this, verified
// against its live API, so it's enforced entirely client-side here) and
// the 5-minute countdown display. voice-page.test.tsx covers the UI given
// a mocked hook value; this covers the hook's own timer behavior, with a
// stub Vapi client (the same shape Playwright injects) and fetch mocked
// so no real network call happens.
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVoiceCall } from "@/lib/use-voice-call";
import { CallTones } from "@/lib/call-tones";

class StubVapi {
  private listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
  on(event: string, cb: (...args: unknown[]) => void) {
    (this.listeners[event] ??= []).push(cb);
    return this;
  }
  emit(event: string, ...args: unknown[]) {
    for (const cb of this.listeners[event] ?? []) cb(...args);
  }
  start = vi.fn().mockResolvedValue(null);
  stop = vi.fn(() => {
    this.emit("call-end");
    return Promise.resolve();
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("useVoiceCall - pre-connect cancellation", () => {
  let stub: StubVapi;

  beforeEach(() => {
    stub = new StubVapi();
    (globalThis as { __VAPI_STUB__?: StubVapi }).__VAPI_STUB__ = stub;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as { __VAPI_STUB__?: StubVapi }).__VAPI_STUB__;
  });

  it("ends immediately while conversation creation is pending, then cancels the late row without starting Vapi", async () => {
    const creation = deferred<Response>();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url).endsWith("/api/conversations")) return creation.promise;
      return new Response(JSON.stringify({ ended: true }), { status: 200 });
    });
    const { result } = renderHook(() => useVoiceCall("test-access-token"));
    let start!: Promise<void>;
    act(() => { start = result.current.startCall(); });
    expect(result.current.callState).toBe("requesting");
    act(() => result.current.endCall());
    expect(result.current.callState).toBe("ended");

    creation.resolve(new Response(JSON.stringify({ conversation_id: "late", token: "late-token" }), { status: 200 }));
    await act(async () => { await start; });
    expect(stub.start).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/conversations/late/cancel"), expect.objectContaining({ method: "POST" }));
    expect(result.current.callState).toBe("ended");
  });

  it("stops and cancels when the user ends while Vapi.start is still pending", async () => {
    const starting = deferred<null>();
    stub.start.mockReturnValueOnce(starting.promise);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url).endsWith("/api/conversations")) return new Response(JSON.stringify({ conversation_id: "c1", token: "t1" }), { status: 200 });
      return new Response(JSON.stringify({ ended: true }), { status: 200 });
    });
    const { result } = renderHook(() => useVoiceCall("test-access-token"));
    let start!: Promise<void>;
    act(() => { start = result.current.startCall(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(result.current.callState).toBe("connecting");
    act(() => result.current.endCall());
    expect(result.current.callState).toBe("ended");
    starting.resolve(null);
    await act(async () => { await start; });
    expect(stub.stop).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/conversations/c1/cancel"), expect.anything());
    expect(result.current.callState).toBe("ended");
  });

  it("cancels a late-created row when the component unmounts", async () => {
    const creation = deferred<Response>();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url).endsWith("/api/conversations")) return creation.promise;
      return new Response(JSON.stringify({ ended: true }), { status: 200 });
    });
    const { result, unmount } = renderHook(() => useVoiceCall("test-access-token"));
    let start!: Promise<void>;
    act(() => { start = result.current.startCall(); });
    unmount();
    creation.resolve(new Response(JSON.stringify({ conversation_id: "orphan", token: "orphan-token" }), { status: 200 }));
    await act(async () => { await start; });
    expect(stub.start).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/conversations/orphan/cancel"), expect.objectContaining({ keepalive: true }));
  });
});

describe("useVoiceCall - timers", () => {
  let stub: StubVapi;

  beforeEach(() => {
    vi.useFakeTimers();
    stub = new StubVapi();
    (globalThis as { __VAPI_STUB__?: StubVapi }).__VAPI_STUB__ = stub;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ conversation_id: "c1", token: "t1" }), { status: 200 }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (globalThis as { __VAPI_STUB__?: StubVapi }).__VAPI_STUB__;
  });

  it("counts down from 5 minutes once the call connects", async () => {
    const { result } = renderHook(() => useVoiceCall("test-access-token"));
    await act(async () => {
      await result.current.startCall();
    });
    act(() => stub.emit("call-start"));
    expect(result.current.remainingSeconds).toBe(300);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(result.current.remainingSeconds).toBe(290);
  });

  it("ends the call itself after 30s of caller silence, and says so in the summary", async () => {
    const { result } = renderHook(() => useVoiceCall("test-access-token"));
    await act(async () => {
      await result.current.startCall();
    });
    act(() => stub.emit("call-start")); // callState -> "listening"

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(stub.stop).toHaveBeenCalledOnce();
    expect(result.current.endOfCallSummary).toMatchObject({ endedDueToSilence: true });
  });

  it("does not time out while the agent is mid-reply (activity keeps resetting the clock)", async () => {
    const { result } = renderHook(() => useVoiceCall("test-access-token"));
    await act(async () => {
      await result.current.startCall();
    });
    act(() => stub.emit("call-start"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    act(() => stub.emit("speech-start")); // the agent starts talking - real activity, not silence
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000); // 40s total, but well under 30s since the agent spoke
    });

    expect(stub.stop).not.toHaveBeenCalled();
  });

  it("a normal hang-up does not report itself as a silence timeout", async () => {
    const connectTone = vi.spyOn(CallTones.prototype, "startConnecting").mockImplementation(() => {});
    const stopTone = vi.spyOn(CallTones.prototype, "stopConnecting").mockImplementation(() => {});
    const hangupTone = vi.spyOn(CallTones.prototype, "playHangup").mockImplementation(() => {});
    const { result } = renderHook(() => useVoiceCall("test-access-token"));
    await act(async () => {
      await result.current.startCall();
    });
    expect(connectTone).toHaveBeenCalledOnce();
    act(() => stub.emit("call-start"));
    expect(stopTone).toHaveBeenCalled();
    act(() => result.current.endCall());

    expect(hangupTone).toHaveBeenCalledOnce();
    expect(result.current.endOfCallSummary).toMatchObject({ endedDueToSilence: false });
  });

  it("moves from Listening to Thinking on the caller's final transcript, then Speaking", async () => {
    const { result } = renderHook(() => useVoiceCall("test-access-token"));
    await act(async () => { await result.current.startCall(); });
    act(() => stub.emit("call-start"));
    expect(result.current.callState).toBe("listening");
    act(() => stub.emit("message", { type: "transcript", role: "user", transcript: "Please check that", transcriptType: "final" }));
    expect(result.current.callState).toBe("agent_thinking");
    act(() => stub.emit("speech-start"));
    expect(result.current.callState).toBe("agent_speaking");
    act(() => stub.emit("speech-end"));
    expect(result.current.callState).toBe("listening");
  });
});

describe("useVoiceCall - the transcript", () => {
  let stub: StubVapi;
  const line = (role: "user" | "assistant", transcript: string) => ({ type: "transcript", role, transcript, transcriptType: "final" });

  beforeEach(() => {
    vi.useFakeTimers();
    stub = new StubVapi();
    (globalThis as { __VAPI_STUB__?: StubVapi }).__VAPI_STUB__ = stub;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url).endsWith("/turns")) {
        return new Response(JSON.stringify({ turns: [{ seq: 1, user_transcript: "What fee do you charge for international payments?", assistant_response: "Fees vary by corridor, and you see the exact fee before you confirm." }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ conversation_id: "c1", token: "t1" }), { status: 200 });
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (globalThis as { __VAPI_STUB__?: StubVapi }).__VAPI_STUB__;
  });

  it("doesn't duplicate a live caption line that arrives while the sync request is still in flight", async () => {
    let resolveFetch!: (value: Response) => void;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url).endsWith("/turns")) return new Promise<Response>((resolve) => (resolveFetch = resolve));
      return new Response(JSON.stringify({ conversation_id: "c1", token: "t1" }), { status: 200 });
    });
    const { result } = renderHook(() => useVoiceCall("test-access-token"));
    await act(async () => {
      await result.current.startCall();
    });
    act(() => {
      stub.emit("call-start");
      stub.emit("message", line("user", "What are your fees?"));
      stub.emit("speech-start");
      stub.emit("message", line("assistant", "Fees depend on the corridor."));
      stub.emit("speech-end"); // kicks off the sync after 700ms
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    // The tail of the same reply arrives while the /turns request above is
    // still pending - this is the line a mark taken before the fetch would miss.
    act(() => stub.emit("message", line("assistant", " It's shown before you confirm.")));
    await act(async () => {
      resolveFetch(
        new Response(JSON.stringify({ turns: [{ seq: 1, user_transcript: "What are your fees?", assistant_response: "Fees depend on the corridor. It's shown before you confirm." }] }), { status: 200 }),
      );
      await Promise.resolve();
    });

    expect(result.current.fullTranscript).toEqual([
      { role: "assistant", text: "Thanks for calling RelayPay support. How can I help you today?" },
      { role: "user", text: "What are your fees?" },
      { role: "assistant", text: "Fees depend on the corridor. It's shown before you confirm." },
    ]);
  });

  it("replaces Vapi's fragmented lines with the recorded turn once the agent finishes speaking, keeping the greeting", async () => {
    const greeting = "Hi Amara, thanks for calling RelayPay support. How can I help you today?";
    const { result } = renderHook(() => useVoiceCall("test-access-token", { greeting }));
    await act(async () => {
      await result.current.startCall();
    });
    expect(stub.start.mock.calls[0]![1]).toMatchObject({ firstMessage: greeting });

    act(() => {
      stub.emit("call-start");
      stub.emit("message", line("assistant", "Hi Amara, thanks for calling RelayPay support."));
      stub.emit("message", line("user", "What fee do you charge"));
      stub.emit("message", line("user", "for international payments?"));
      stub.emit("speech-start");
      stub.emit("message", line("assistant", "Fees for Internet"));
      stub.emit("message", line("assistant", "international payments vary."));
    });
    expect(result.current.fullTranscript).toHaveLength(5);

    act(() => stub.emit("speech-end"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(result.current.fullTranscript).toEqual([
      { role: "assistant", text: greeting },
      { role: "user", text: "What fee do you charge for international payments?" },
      { role: "assistant", text: "Fees vary by corridor, and you see the exact fee before you confirm." },
    ]);
  });
});
