-- Historik: medel/min/max per tidsintervall, så att klienten får få punkter.
create index if not exists readings_capability_ts on public.readings (capability_id, ts);

create or replace function public.history(cap text, since timestamptz, bucket interval)
returns table (device_id text, t timestamptz, v double precision, vmin double precision, vmax double precision)
language sql stable security invoker set search_path = '' as $$
  select r.device_id,
         date_bin(bucket, r.ts, timestamptz '2000-01-01') as t,
         avg(r.value), min(r.value), max(r.value)
  from public.readings r
  where r.capability_id = cap and r.ts >= since
  group by 1, 2
  order by 2
$$;
revoke all on function public.history(text, timestamptz, interval) from public, anon;
grant execute on function public.history(text, timestamptz, interval) to authenticated;
