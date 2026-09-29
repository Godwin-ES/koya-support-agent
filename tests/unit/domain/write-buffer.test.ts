import { describe, expect, it, vi } from "vitest";
import { RetryBuffer } from "@core/domain/write-buffer";

function fakeSupabase(failCount: number) {
  let calls = 0;
  const insert = vi.fn(async () => {
    calls++;
    if (calls <= failCount) return { error: new Error("down") };
    return { error: null };
  });
  const client = { from: () => ({ insert }) } as unknown as import("@supabase/supabase-js").SupabaseClient;
  return { client, insert };
}

describe("RetryBuffer", () => {
  it("writes straight through when Supabase is healthy - no buffering", async () => {
    const { client, insert } = fakeSupabase(0);
    const buffer = new RetryBuffer(client);
    await buffer.writeOrBuffer("conversation_turns", { seq: 1 });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(buffer.pending).toBe(0);
  });

  it("retries once before buffering - a write that recovers on the retry never gets buffered", async () => {
    const { client, insert } = fakeSupabase(1); // fails once, then succeeds
    const buffer = new RetryBuffer(client);
    await buffer.writeOrBuffer("conversation_turns", { seq: 1 });
    expect(insert).toHaveBeenCalledTimes(2);
    expect(buffer.pending).toBe(0);
  });

  it("buffers a write that fails through the retry, without throwing", async () => {
    const { client } = fakeSupabase(10); // never succeeds within this test
    const buffer = new RetryBuffer(client);
    await expect(buffer.writeOrBuffer("conversation_turns", { seq: 1 })).resolves.toBeUndefined();
    expect(buffer.pending).toBe(1);
  });

  it("calls onFirstBuffer exactly once, only when the buffer goes from empty to non-empty", async () => {
    const { client } = fakeSupabase(10);
    const onFirstBuffer = vi.fn();
    const buffer = new RetryBuffer(client, { onFirstBuffer });
    await buffer.writeOrBuffer("conversation_turns", { seq: 1 });
    await buffer.writeOrBuffer("conversation_turns", { seq: 2 });
    expect(onFirstBuffer).toHaveBeenCalledTimes(1);
    expect(buffer.pending).toBe(2);
  });

  it("flush() drains a buffered write once the target recovers", async () => {
    // Fails the first 2 calls (writeOrBuffer's direct attempt + its one retry), then recovers -
    // so the write gets buffered, and a later flush() call (the 3rd insert call) succeeds.
    const { client, insert } = fakeSupabase(2);
    const buffer = new RetryBuffer(client);
    await buffer.writeOrBuffer("conversation_turns", { seq: 1 });
    expect(buffer.pending).toBe(1);

    const flushed = await buffer.flush();
    expect(flushed).toBe(1);
    expect(buffer.pending).toBe(0);
    expect(insert).toHaveBeenCalledTimes(3);
  });

  it("flush() returns 0 and does nothing when nothing is buffered", async () => {
    const { client } = fakeSupabase(0);
    const buffer = new RetryBuffer(client);
    expect(await buffer.flush()).toBe(0);
  });
});
