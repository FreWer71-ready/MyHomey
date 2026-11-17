-- Elpris per dygn (svensk tid), tidsviktat, för jämförelse med fast pris över långa perioder (upp till 400 dygn).
-- Bara hela dygn före i dag; dagens priser läses som vanligt. Körs som anroparen, så RLS på spot_prices gäller.
create or replace function public.spot_daily(p_area text default 'SE3', p_days int default 360)
returns table (day date, ore double precision, covered_s double precision)
language sql stable security invoker set search_path = ''
as $$
  with b as (
    select date_trunc('day', now() at time zone 'Europe/Stockholm') as today
  )
  select (s.start_ts at time zone 'Europe/Stockholm')::date,
         sum(s.sek_per_kwh * 100 * extract(epoch from s.end_ts - s.start_ts)) / nullif(sum(extract(epoch from s.end_ts - s.start_ts)), 0),
         sum(extract(epoch from s.end_ts - s.start_ts))
  from public.spot_prices s, b
  where s.area = p_area
    and s.start_ts >= (b.today - make_interval(days => least(greatest(p_days, 1), 400))) at time zone 'Europe/Stockholm'
    and s.start_ts < b.today at time zone 'Europe/Stockholm'
  group by 1
  order by 1;
$$;
revoke execute on function public.spot_daily(text, int) from public, anon;
grant execute on function public.spot_daily(text, int) to authenticated;
