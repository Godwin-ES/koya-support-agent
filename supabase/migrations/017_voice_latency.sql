-- Migration 17: Vapi's own per-call latency breakdown (end-of-call report,
-- artifact.performanceMetrics), so the console shows where a voice turn's
-- wait actually goes - listening for the end of speech, the model's first
-- token, or text-to-speech - instead of guessing. Averages in milliseconds
-- plus interruption counts; null for chats and for calls whose report had none.
alter table conversations add column voice_latency jsonb;
