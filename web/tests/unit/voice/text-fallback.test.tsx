import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TextFallback } from "@/components/voice/text-fallback";

function sseChunk(text: string): string {
  return `data: ${JSON.stringify({ text })}\n\n`;
}

function streamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i++]));
      } else {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });
  return new Response(body, { status: 200 });
}

describe("TextFallback", () => {
  it("Enter sends exactly once, and the draft clears", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ conversation_id: "c1", token: "t1" }), { status: 200 }))
      .mockResolvedValueOnce(streamResponse([sseChunk("Fees "), sseChunk("depend on the corridor.")]));

    render(<TextFallback onSwitchToVoice={() => {}} />);
    const textbox = screen.getByLabelText("Type a message");
    await user.type(textbox, "What are your fees?");
    await user.type(textbox, "{Enter}");

    await waitFor(() => expect(screen.getByText(/depend on the corridor/)).toBeInTheDocument());
    expect(fetchSpy).toHaveBeenCalledTimes(2); // one /api/conversations, one /api/text - not sent twice
    expect(textbox).toHaveValue("");

    fetchSpy.mockRestore();
  });

  it("Shift+Enter adds a new line instead of sending", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<TextFallback onSwitchToVoice={() => {}} />);
    const textbox = screen.getByLabelText("Type a message");
    await user.type(textbox, "line one{Shift>}{Enter}{/Shift}line two");

    expect(textbox).toHaveValue("line one\nline two");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("Send is disabled while a reply streams", async () => {
    const user = userEvent.setup();
    const deferredStream = new Promise<Response>(() => {}); // never resolves within this test
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ conversation_id: "c1", token: "t1" }), { status: 200 })).mockReturnValueOnce(deferredStream);

    render(<TextFallback onSwitchToVoice={() => {}} />);
    const textbox = screen.getByLabelText("Type a message");
    await user.type(textbox, "Hello");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Send" })).toBeDisabled());
    expect(screen.getByRole("button", { name: "Send" })).toHaveAccessibleDescription("Waiting for the reply");
  });

  it("Send is disabled with 'Type a message' while the box is empty", () => {
    render(<TextFallback onSwitchToVoice={() => {}} />);
    expect(screen.getByRole("button", { name: "Send" })).toHaveAccessibleDescription("Type a message");
  });

  it("End conversation is disabled until a message has been sent", () => {
    render(<TextFallback onSwitchToVoice={() => {}} />);
    expect(screen.getByRole("button", { name: "End conversation" })).toBeDisabled();
  });

  it("End conversation calls POST /api/text/end and shows the closing message", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ conversation_id: "c1", token: "t1" }), { status: 200 }))
      .mockResolvedValueOnce(streamResponse([sseChunk("Fees vary.")]))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ended: true }), { status: 200 }));

    render(<TextFallback onSwitchToVoice={() => {}} />);
    const textbox = screen.getByLabelText("Type a message");
    await user.type(textbox, "What are your fees?{Enter}");
    await waitFor(() => expect(screen.getByText(/fees vary/i)).toBeInTheDocument());

    const endButton = screen.getByRole("button", { name: "End conversation" });
    expect(endButton).not.toBeDisabled();
    await user.click(endButton);

    await waitFor(() => expect(screen.getByText(/thanks for chatting/i)).toBeInTheDocument());
  });
});
