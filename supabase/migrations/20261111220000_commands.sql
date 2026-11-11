-- Logg över kommandon från dashboarden (scener m.m.).
create table public.commands (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  type text not null check (type in ('scene')),
  zone_id text,
  scene text check (scene in ('ljust', 'mys', 'slack')),
  ok boolean not null,
  error text
);
alter table public.commands enable row level security;
create policy commands_insert on public.commands for insert to authenticated
  with check ((select public.is_allowed()) and created_by = (select auth.uid()));
create policy commands_read on public.commands for select to authenticated using ((select public.is_allowed()));
