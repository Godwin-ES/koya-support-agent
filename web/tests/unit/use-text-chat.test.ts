import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTextChat } from "@/lib/use-text-chat";

afterEach(() => vi.restoreAllMocks());

function reply(token: string): Response {
  return new Response('data: {"text":"ok"}\n\ndata: [DONE]\n\n', { status: 200, headers: { "X-Conversation-Token": token } });
}

describe("useTextChat", () => {
  it("sends each message with the freshest token the server handed back", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ conversation_id: "c1", token: "t1" }), { status: 200 }))
      .mockResolvedValueOnce(reply("t2"))
      .mockResolvedValueOnce(reply("t3"));
    const { result } = renderHook(() => useTextChat("access-token"));

    await act(async () => {
      await result.current.sendMessage("first");
    });
    await act(async () => {
      await result.current.sendMessage("second");
    });

    const sentTokens = fetchSpy.mock.calls.slice(1).map(([, init]) => JSON.parse(String((init as RequestInit).body)).token);
    expect(sentTokens).toEqual(["t1", "t2"]);
  });
});
