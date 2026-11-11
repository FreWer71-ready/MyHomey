-- Namnsdagar per datum (Svenska dagar), fylls av edge-funktionen name-days.
create table public.name_days (
  date date primary key,
  names text[] not null default '{}'
);
alter table public.name_days enable row level security;
create policy name_days_read on public.name_days for select to authenticated using ((select public.is_allowed()));
