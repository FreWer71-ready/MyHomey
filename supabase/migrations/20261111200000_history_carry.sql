-- Historik: ta med senaste värdet före perioden, så att sensorer som sällan
-- ändras (värdet sparas bara vid ändring) syns som en jämn linje.
create or replace function public.history(cap text, since timestamptz, bucket interval)
returns table (device_id text, t timestamptz, v double precision, vmin double precision, vmax double precision)
language sql stable security invoker set search_path = '' as $$
  with points as (
    select r.device_id, r.ts, r.value
    from public.readings r
    where r.capability_id = cap and r.ts >= since
    union all
    (select distinct on (r.device_id) r.device_id, since, r.value
     from public.readings r
     where r.capability_id = cap and r.ts < since
     order by r.device_id, r.ts desc)
  )
  select device_id, date_bin(bucket, ts, timestamptz '2000-01-01') as t, avg(value), min(value), max(value)
  from points
  group by 1, 2
  order by 2
$$;
