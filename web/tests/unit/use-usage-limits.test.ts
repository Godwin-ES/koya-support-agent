import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useUsageLimits } from "@/lib/use-usage-limits";

const LIMITS = { calls: { used: 1, limit: 5 }, chat: { used: 4, limit: 90, per_conversation: 30, max_chars: 1000 } };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useUsageLimits", () => {
  it("returns today's call and chat usage once the fetch resolves", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(LIMITS), { status: 200 }));
    const { result } = renderHook(() => useUsageLimits("tok-1", "idle"));

    expect(result.current).toBeNull(); // nothing yet, before the fetch resolves
    await waitFor(() => expect(result.current).toEqual(LIMITS));
  });

  it("sends the caller's session token in the Authorization header, never the URL (URLs end up in proxy logs)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(LIMITS), { status: 200 }));
    renderHook(() => useUsageLimits("tok-1", "idle"));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).not.toContain("tok-1");
    expect((init as RequestInit).headers).toEqual({ Authorization: "Bearer tok-1" });
  });

  it("uses an opaque browser id for guest limits", async () => {
    localStorage.clear();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(LIMITS), { status: 200 }));
    renderHook(() => useUsageLimits(null, "idle"));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect((fetchSpy.mock.calls[0]![1] as RequestInit).headers).toMatchObject({ "X-Guest-Id": expect.any(String) });
  });

  it("stays null (not throw) when the fetch fails - a nice-to-have display, never load-bearing", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    const { result } = renderHook(() => useUsageLimits("tok-1", "idle"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toBeNull();
  });

  it("refetches when refreshKey changes", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(LIMITS), { status: 200 }));
    const { rerender } = renderHook(({ key }) => useUsageLimits("tok-1", key), { initialProps: { key: "idle" } });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    rerender({ key: "ended" });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
  });
});
