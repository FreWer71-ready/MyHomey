-- Favoritflows (Homey-användarens favoriter) som kan startas från startsidan.
create table public.flows (
  id text primary key,
  name text not null,
  advanced boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.flows enable row level security;
create policy flows_read on public.flows for select to authenticated using ((select public.is_allowed()));

-- Ersätter hela listan när payloaden har "flows"; annars görs inget.
create or replace function public.ingest_flows(p jsonb)
returns int language plpgsql set search_path = '' as $$
declare
  n int;
begin
  if jsonb_typeof(p->'flows') is distinct from 'array' then return null; end if;

  insert into public.flows (id, name, advanced)
  select f->>'id', f->>'name', coalesce((f->>'advanced')::boolean, false)
  from jsonb_array_elements(p->'flows') f
  where f->>'id' is not null and f->>'name' is not null
  on conflict (id) do update
    set name = excluded.name, advanced = excluded.advanced, updated_at = now()
    where (flows.name, flows.advanced) is distinct from (excluded.name, excluded.advanced);

  delete from public.flows
  where id not in (select f->>'id' from jsonb_array_elements(p->'flows') f where f->>'id' is not null);

  select count(*) into n from public.flows;
  return n;
end
$$;
revoke all on function public.ingest_flows(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_flows(jsonb) to service_role;

-- Kommandon: även flows.
alter table public.commands drop constraint commands_type_check;
alter table public.commands add constraint commands_type_check check (type in ('scene', 'mood', 'flow'));
alter table public.commands add column flow_id text;
