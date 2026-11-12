-- Närvaro (Smart Presence, capability presence) sparas i historiken.
create or replace function public.is_logged_capability(cap text)
returns boolean language sql immutable set search_path = '' as $$
  select cap like 'measure\_%' or cap like 'meter\_%' or cap like 'alarm\_%'
      or cap in ('onoff', 'dim', 'target_temperature', 'presence')
$$;

-- Startpunkt: nuvarande läge med tiden för senaste ändring.
insert into public.readings (device_id, capability_id, ts, value)
select device_id, capability_id, last_updated, case when value_bool then 1 else 0 end
from public.capability_state
where capability_id = 'presence' and value_bool is not null and last_updated is not null
on conflict do nothing;

-- Tidslinje för valfri av/på-capability: ändringar sedan "since" plus läget precis innan.
create or replace function public.bool_timeline(cap text, since timestamptz)
returns table (device_id text, ts timestamptz, value double precision)
language sql stable security invoker set search_path = '' as $$
  select device_id, ts, value from (
    select r.device_id, r.ts, r.value
    from public.readings r
    where r.capability_id = cap and r.ts >= since
    union all
    (select distinct on (r.device_id) r.device_id, since, r.value
     from public.readings r
     where r.capability_id = cap and r.ts < since
     order by r.device_id, r.ts desc)
  ) x
  order by device_id, ts
$$;
revoke all on function public.bool_timeline(text, timestamptz) from public, anon;
grant execute on function public.bool_timeline(text, timestamptz) to authenticated;
