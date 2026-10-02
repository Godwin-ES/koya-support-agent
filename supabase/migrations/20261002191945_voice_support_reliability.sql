-- Voice-support reliability: explicit access scope and collision-safe callbacks.

alter table conversations
  add column access_scope text not null default 'evaluation'
  check (access_scope in ('customer', 'account_without_customer', 'guest', 'evaluation'));

update conversations
set access_scope = case
  when caller_ref is null then 'evaluation'
  when verified_customer_id is null then 'account_without_customer'
  else 'customer'
end;

-- Preserve legacy callback timestamps for audit, but stop treating expired,
-- weekend, or out-of-hours legacy data as an active booking.
update escalations
set call_booked = false
where call_booked
  and callback_time is not null
  and (
    callback_time <= now()
    or extract(isodow from callback_time at time zone 'Africa/Lagos') not between 1 and 5
    or (callback_time at time zone 'Africa/Lagos')::time < time '09:00'
    or (callback_time at time zone 'Africa/Lagos')::time > time '14:30'
  );

-- If legacy rows already overlap, retain the earliest-created reservation and
-- mark the rest inactive before installing the hard database guarantee.
with ranked as (
  select
    id,
    row_number() over (
      partition by callback_time
      order by created_at, id
    ) as position
  from escalations
  where call_booked
    and callback_time is not null
    and status in ('open', 'in_progress')
)
update escalations e
set call_booked = false
from ranked r
where e.id = r.id and r.position > 1;

alter table escalations
  add constraint escalations_callback_business_hours_check
  check (
    not call_booked
    or (
      callback_time is not null
      and extract(isodow from callback_time at time zone 'Africa/Lagos') between 1 and 5
      and (callback_time at time zone 'Africa/Lagos')::time >= time '09:00'
      and (callback_time at time zone 'Africa/Lagos')::time <= time '14:30'
    )
  );

-- PostgreSQL marks timestamptz + interval STABLE because day/month intervals
-- can depend on the session timezone. A fixed 30-minute elapsed range cannot,
-- so expose that narrow operation as immutable for the GiST expression.
create function callback_slot_range(p_start timestamptz)
returns tstzrange
language sql
immutable
strict
as $$
  select tstzrange(p_start, p_start + interval '30 minutes', '[)')
$$;

alter table escalations
  add constraint escalations_callback_no_overlap
  exclude using gist (
    callback_slot_range(callback_time) with &&
  )
  where (call_booked and callback_time is not null and status in ('open', 'in_progress'));

create or replace function create_confirmed_escalation(
  p_conversation_id uuid,
  p_customer_id text,
  p_user_name text,
  p_user_email text,
  p_category text,
  p_reason text,
  p_callback_time timestamptz default null,
  p_ticket_id uuid default null
)
returns table (outcome text, escalation_id uuid, ticket_id uuid)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_escalation_id uuid;
  v_ticket_id uuid;
begin
  select e.id, e.ticket_id
  into v_escalation_id, v_ticket_id
  from escalations e
  where e.conversation_id = p_conversation_id
    and e.status in ('open', 'in_progress')
  order by e.created_at
  limit 1;

  if v_escalation_id is not null then
    return query select 'existing'::text, v_escalation_id, v_ticket_id;
    return;
  end if;

  begin
    v_ticket_id := p_ticket_id;
    if v_ticket_id is null then
      insert into support_tickets (
        conversation_id, customer_id, category, priority, summary
      ) values (
        p_conversation_id, p_customer_id, p_category, 'high', p_reason
      )
      on conflict (conversation_id, category) where status = 'open'
      do update set summary = excluded.summary
      returning id into v_ticket_id;
    end if;

    insert into escalations (
      ticket_id,
      conversation_id,
      customer_id,
      user_name,
      user_email,
      category,
      reason,
      call_booked,
      callback_time
    ) values (
      v_ticket_id,
      p_conversation_id,
      p_customer_id,
      p_user_name,
      p_user_email,
      p_category,
      p_reason,
      p_callback_time is not null,
      p_callback_time
    )
    returning id into v_escalation_id;
  exception
    when exclusion_violation then
      return query select 'slot_unavailable'::text, null::uuid, null::uuid;
      return;
  end;

  return query select 'created'::text, v_escalation_id, v_ticket_id;
end;
$$;

revoke all on function create_confirmed_escalation(uuid, text, text, text, text, text, timestamptz, uuid) from public, anon, authenticated;
grant execute on function create_confirmed_escalation(uuid, text, text, text, text, text, timestamptz, uuid) to service_role;
