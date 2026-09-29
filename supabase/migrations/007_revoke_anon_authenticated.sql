-- Migration 7: explicit REVOKE for anon/authenticated on every table.
--
-- Real finding while testing migration 006: Supabase's own project
-- template already grants baseline table privileges to `anon` and
-- `authenticated` by default (confirmed live - a fresh `anon` client's
-- `select()` on a brand-new table came back `{ data: [], error: null,
-- status: 200 }`, not a permission error). RLS enabled with zero policies
-- still denies every *row* - the security outcome SYSTEM-DESIGN.md §7 asks
-- for ("browsers never read... data") already held - but the "no grant at
-- all" reading in migration 006's own comment wasn't accurate, and relying
-- on an unstated Supabase default rather than an explicit statement here
-- is exactly the kind of thing worth making self-documenting instead.
--
-- This does not change the actual security boundary (RLS already denied
-- every row); it makes the boundary explicit and independent of whichever
-- default Supabase's template happens to set, and turns "anon gets zero
-- rows" into "anon gets a permission-denied error", the stronger and more
-- legible guarantee - confirmed by tests/integration/db/rls.test.ts,
-- which failed first against migration 006 alone before this was added.

revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
