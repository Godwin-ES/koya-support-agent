import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCallLimit } from "@/lib/use-call-limit";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useCallLimit", () => {
  it("returns the server's used/limit once the fetch resolves", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ used: 1, limit: 3 }), { status: 200 }));
    const { result } = renderHook(() => useCallLimit("tok-1", "idle"));

    expect(result.current).toBeNull(); // nothing yet, before the fetch resolves
    await waitFor(() => expect(result.current).toEqual({ used: 1, limit: 3 }));
  });

  it("sends the caller's session token - the limit is per account, and agent-server rejects the request without it", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ used: 0, limit: 3 }), { status: 200 }));
    renderHook(() => useCallLimit("tok 1/x", "idle"));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(String(fetchSpy.mock.calls[0]![0])).toContain("/api/limits?access_token=tok%201%2Fx");
  });

  it("stays null (not throw) when the fetch fails - a nice-to-have display, never load-bearing", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    const { result } = renderHook(() => useCallLimit("tok-1", "idle"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toBeNull();
  });

  it("refetches when refreshKey changes", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ used: 0, limit: 3 }), { status: 200 }));
    const { rerender } = renderHook(({ key }) => useCallLimit("tok-1", key), { initialProps: { key: "idle" } });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    rerender({ key: "ended" });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
  });
});
