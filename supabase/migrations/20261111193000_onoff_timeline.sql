-- Tidslinje för på/av: alla ändringar sedan "since" plus läget precis innan.
create or replace function public.onoff_timeline(since timestamptz)
returns table (device_id text, ts timestamptz, value double precision)
language sql stable security invoker set search_path = '' as $$
  select device_id, ts, value from (
    select r.device_id, r.ts, r.value
    from public.readings r
    where r.capability_id = 'onoff' and r.ts >= since
    union all
    (select distinct on (r.device_id) r.device_id, since, r.value
     from public.readings r
     where r.capability_id = 'onoff' and r.ts < since
     order by r.device_id, r.ts desc)
  ) x
  order by device_id, ts
$$;
revoke all on function public.onoff_timeline(timestamptz) from public, anon;
grant execute on function public.onoff_timeline(timestamptz) to authenticated;
