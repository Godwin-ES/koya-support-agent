import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTextChat } from "@/lib/use-text-chat";

afterEach(() => vi.restoreAllMocks());

function reply(token: string): Response {
  return new Response('data: {"text":"ok"}\n\ndata: [DONE]\n\n', { status: 200, headers: { "X-Conversation-Token": token } });
}

describe("useTextChat", () => {
  it("starts guest chat with a browser id and no access token", async () => {
    localStorage.clear();
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ conversation_id: "g1", token: "gt1" }), { status: 200 }))
      .mockResolvedValueOnce(reply("gt2"));
    const { result } = renderHook(() => useTextChat(null));
    await act(async () => { await result.current.sendMessage("What is RelayPay?"); });
    const body = JSON.parse(String((fetchSpy.mock.calls[0]![1] as RequestInit).body));
    expect(body).toMatchObject({ channel: "web_text", browser_id: expect.any(String) });
    expect(body).not.toHaveProperty("access_token");
  });

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

  it("carries on a resumed chat: shows what was said, and gets its token from resume instead of starting a new conversation", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ conversation_id: "open-1", token: "t1", turns: [] }), { status: 200 }))
      .mockResolvedValueOnce(reply("t2"));
    const resume = { id: "open-1", messages: [{ role: "user" as const, text: "What are your fees?" }, { role: "assistant" as const, text: "They depend on the corridor." }] };
    const { result } = renderHook(() => useTextChat("access-token", resume));
    expect(result.current.turns).toEqual(resume.messages);

    await act(async () => {
      await result.current.sendMessage("And for Kenya?");
    });

    const [resumeUrl, resumeInit] = fetchSpy.mock.calls[0]!;
    expect(String(resumeUrl)).toMatch(/\/api\/conversations\/resume$/);
    expect(JSON.parse(String((resumeInit as RequestInit).body))).toEqual({ access_token: "access-token", conversation_id: "open-1" });
    expect(JSON.parse(String((fetchSpy.mock.calls[1]![1] as RequestInit).body))).toMatchObject({ conversation_id: "open-1", token: "t1" });
    expect(result.current.turns.map((t) => t.text)).toEqual(["What are your fees?", "They depend on the corridor.", "And for Kenya?", "ok"]);
  });

  it("a resumed chat the server has since closed reports conversation_ended, so the page offers a new one", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ error: "no_open_chat" }), { status: 404 }));
    const { result } = renderHook(() => useTextChat("access-token", { id: "open-1", messages: [] }));
    await act(async () => {
      await expect(result.current.sendMessage("hello?")).rejects.toMatchObject({ code: "conversation_ended" });
    });
  });
});
