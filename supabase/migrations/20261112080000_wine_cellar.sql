-- Vinkällaren från Trandvine (eget Supabase-projekt). Trandvine skickar en sammanfattning per
-- användare (e-post) till edge-funktionen wine-ingest; e-posten mappas till hushåll via app_users.
create table public.wine_cellar (
  household_id text primary key references public.households (id),
  total int not null,
  by_color jsonb not null default '{}',
  latest jsonb,
  value numeric,
  updated_at timestamptz not null default now()
);
alter table public.wine_cellar enable row level security;
create policy wine_cellar_read on public.wine_cellar for select to authenticated using (household_id = (select public.my_household()));
