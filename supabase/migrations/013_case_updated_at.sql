-- Migration 13: adds `updated_at` to support_tickets and escalations, plus
-- a trigger that bumps it on every update - the console's optimistic
-- concurrency check (SYSTEM-DESIGN.md §11.5: "every change carries the
-- row's updated_at. If someone else changed it first, the server returns
-- 409...") needs a value that actually changes on write, not just
-- created_at.

alter table support_tickets add column updated_at timestamptz not null default now();
alter table escalations add column updated_at timestamptz not null default now();

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger support_tickets_set_updated_at
  before update on support_tickets
  for each row execute function set_updated_at();

create trigger escalations_set_updated_at
  before update on escalations
  for each row execute function set_updated_at();
