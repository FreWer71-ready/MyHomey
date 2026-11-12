-- Vinkällarens historik: en rad per ändring av antalet (från wine-ingest).
-- Historik före kopplingen räknades fram ur Trandvine (köpt/druckit) och lades in en gång.
create table public.wine_history (
  household_id text not null references public.households (id),
  ts timestamptz not null,
  total int not null,
  by_color jsonb,
  primary key (household_id, ts)
);
alter table public.wine_history enable row level security;
create policy wine_history_read on public.wine_history for select to authenticated using (household_id = (select public.my_household()));
