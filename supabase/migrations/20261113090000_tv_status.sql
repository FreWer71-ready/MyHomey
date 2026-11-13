-- TV-status från den lokala ADB-agenten (agents/tv-adb) via edge-funktionen tv-ingest.
-- En rad per hushåll och enhet; läses av dashboarden (RLS per hushåll).
create table if not exists public.tv_status (
  household_id text not null references public.households(id) on delete cascade,
  device_id    text not null,
  is_on        boolean not null default false,
  current_app  text,
  app_name     text,
  media_title  text,
  media_artist text,
  media_status text check (media_status in ('playing', 'paused', 'buffering', 'stopped', 'none')),
  updated_at   timestamptz not null default now(),
  primary key (household_id, device_id)
);

alter table public.tv_status enable row level security;

create policy tv_status_read on public.tv_status
  for select to authenticated
  using (household_id = (select public.my_household()));

grant select on public.tv_status to authenticated;
