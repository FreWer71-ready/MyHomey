-- Tänd när man kommer hem: inställning per hushåll (Hue). Hue-synken (varannan minut) följer personens Life360-position
-- och tänder valda rum när hen kommer hem efter att ha varit borta. away/away_since/last_fired sköts av synken.
create table if not exists public.arrival_lights (
  household_id text primary key default public.my_household(),
  enabled boolean not null default false,
  person text,
  home_lat double precision,
  home_lon double precision,
  zones text[] not null default '{}',
  scene text not null default 'ljust' check (scene in ('ljust', 'mys')),
  only_dark boolean not null default true,
  away boolean not null default false,
  away_since timestamptz,
  last_fired timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.arrival_lights enable row level security;
create policy arrival_lights_read on public.arrival_lights for select to authenticated
  using (household_id = (select public.my_household()));
create policy arrival_lights_insert on public.arrival_lights for insert to authenticated
  with check (household_id = (select public.my_household()));
create policy arrival_lights_update on public.arrival_lights for update to authenticated
  using (household_id = (select public.my_household())) with check (household_id = (select public.my_household()));
