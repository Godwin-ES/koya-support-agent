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
    const { result } = renderHook(() => useVoiceCall("test-access-token"));
    await act(async () => {
      await result.current.startCall();
    });
    act(() => stub.emit("call-start"));
    act(() => result.current.endCall());

    expect(result.current.endOfCallSummary).toMatchObject({ endedDueToSilence: false });
  });
});
