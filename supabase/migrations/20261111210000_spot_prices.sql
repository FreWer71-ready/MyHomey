-- Elpris (spotpris SE3, kvartspris) från elprisetjustnu.se.
create table public.spot_prices (
  area text not null default 'SE3',
  start_ts timestamptz not null,
  end_ts timestamptz not null,
  sek_per_kwh double precision not null,
  primary key (area, start_ts)
);
alter table public.spot_prices enable row level security;
create policy spot_prices_read on public.spot_prices for select to authenticated using ((select public.is_allowed()));
