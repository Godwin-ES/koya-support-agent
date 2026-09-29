-- Migration 14: adds `cost_usd` to conversation_turns and a trigger that
-- rolls it into conversations.cost_usd.
--
-- Real bug, found while building Task 12's evaluation runner (which needs
-- a real per-scenario cost): `agent-server/src/session.ts` has computed
-- `cost_usd` from the SDK's own `total_cost_usd` since Task 6, and
-- returns it in every turn's "done" event - but nothing ever wrote it
-- anywhere. `conversations.cost_usd` (migration 002) has sat at its
-- `default 0` through every real Claude turn since, including the
-- console's own "Cost" column (Task 11), which has been silently showing
-- $0.00 for every real conversation. Confirmed live in an earlier
-- session's curl check against a real turn: `"cost_usd": 0` on a
-- conversation that had just spent real money.

alter table conversation_turns add column cost_usd numeric(10, 4);

create or replace function bump_conversation_cost() returns trigger
language plpgsql as $$
begin
  update conversations set cost_usd = cost_usd + coalesce(new.cost_usd, 0) where id = new.conversation_id;
  return new;
end;
$$;

create trigger conversation_turns_bump_cost
  after insert on conversation_turns
  for each row execute function bump_conversation_cost();

comment on column conversation_turns.cost_usd is 'This turn''s own cost, from the Agent SDK''s total_cost_usd (cumulative-per-query, so this is the delta since the previous turn - session.ts computes it that way already). Rolled into conversations.cost_usd by the trigger above.';
