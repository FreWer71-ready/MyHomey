-- Moods (Homey-scener per rum). Skickas med i ingest om Homey stöder dem.
create table public.moods (
  id text primary key,
  name text not null,
  zone_id text,
  updated_at timestamptz not null default now()
);
create index moods_zone_id on public.moods (zone_id);
alter table public.moods enable row level security;
create policy moods_read on public.moods for select to authenticated using ((select public.is_allowed()));

-- Ersätter hela listan när payloaden har "moods"; annars görs inget.
create or replace function public.ingest_moods(p jsonb)
returns int language plpgsql set search_path = '' as $$
declare
  n int;
begin
  if jsonb_typeof(p->'moods') is distinct from 'array' then return null; end if;

  insert into public.moods (id, name, zone_id)
  select m->>'id', m->>'name', m->>'zone'
  from jsonb_array_elements(p->'moods') m
  where m->>'id' is not null and m->>'name' is not null
  on conflict (id) do update
    set name = excluded.name, zone_id = excluded.zone_id, updated_at = now()
    where (moods.name, moods.zone_id) is distinct from (excluded.name, excluded.zone_id);

  delete from public.moods
  where id not in (select m->>'id' from jsonb_array_elements(p->'moods') m where m->>'id' is not null);

  select count(*) into n from public.moods;
  return n;
end
$$;
revoke all on function public.ingest_moods(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_moods(jsonb) to service_role;
