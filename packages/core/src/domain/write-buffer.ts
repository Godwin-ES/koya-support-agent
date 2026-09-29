// "Supabase unavailable: writes retry with backoff. If still down, the
// turn continues, and the log is buffered in memory and written later, so
// logging never blocks a caller" (SYSTEM-DESIGN.md §10). One small retry
// (immediate insert, then one retry after a short delay) before falling
// back to an in-memory buffer a periodic flush drains once Supabase is
// back - never thrown, so a logging failure can never break a turn.
import type { SupabaseClient } from "@supabase/supabase-js";

interface BufferedWrite {
  table: string;
  row: Record<string, unknown>;
  attempts: number;
}

const RETRY_DELAY_MS = 300;

export class RetryBuffer {
  private buffer: BufferedWrite[] = [];
  private onFirstBuffer: (() => void) | undefined;

  constructor(
    private readonly supabase: SupabaseClient,
    opts: { onFirstBuffer?: () => void } = {},
  ) {
    this.onFirstBuffer = opts.onFirstBuffer;
  }

  get pending(): number {
    return this.buffer.length;
  }

  /** Writes now if possible, otherwise buffers for the next flush() - never throws. */
  async writeOrBuffer(table: string, row: Record<string, unknown>): Promise<void> {
    if (await this.tryWrite(table, row)) return;
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    if (await this.tryWrite(table, row)) return;

    const wasEmpty = this.buffer.length === 0;
    this.buffer.push({ table, row, attempts: 1 });
    if (wasEmpty) this.onFirstBuffer?.();
  }

  private async tryWrite(table: string, row: Record<string, unknown>): Promise<boolean> {
    try {
      const { error } = await this.supabase.from(table).insert(row);
      if (error) console.error(`RetryBuffer: write to ${table} failed:`, error.message, error.details ?? "");
      return !error;
    } catch (err) {
      console.error(`RetryBuffer: write to ${table} threw:`, err instanceof Error ? err.message : err);
      return false;
    }
  }

  /** Retries every buffered write once; whatever still fails stays buffered for the next call. Returns how many were flushed. */
  async flush(): Promise<number> {
    if (this.buffer.length === 0) return 0;
    const remaining: BufferedWrite[] = [];
    let flushed = 0;
    for (const item of this.buffer) {
      if (await this.tryWrite(item.table, item.row)) flushed++;
      else remaining.push({ ...item, attempts: item.attempts + 1 });
    }
    this.buffer = remaining;
    return flushed;
  }
}
