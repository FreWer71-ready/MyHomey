-- Favoritmoods (från Homey-användarens favoriter) visas på startsidan.
alter table public.moods add column favorite boolean not null default false;

create or replace function public.ingest_moods(p jsonb)
returns int language plpgsql set search_path = '' as $$
declare
  n int;
begin
  if jsonb_typeof(p->'moods') is distinct from 'array' then return null; end if;

  insert into public.moods (id, name, zone_id, favorite)
  select m->>'id', m->>'name', m->>'zone', coalesce((m->>'favorite')::boolean, false)
  from jsonb_array_elements(p->'moods') m
  where m->>'id' is not null and m->>'name' is not null
  on conflict (id) do update
    set name = excluded.name, zone_id = excluded.zone_id, favorite = excluded.favorite, updated_at = now()
    where (moods.name, moods.zone_id, moods.favorite) is distinct from (excluded.name, excluded.zone_id, excluded.favorite);

  delete from public.moods
  where id not in (select m->>'id' from jsonb_array_elements(p->'moods') m where m->>'id' is not null);

  select count(*) into n from public.moods;
  return n;
end
$$;
revoke all on function public.ingest_moods(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_moods(jsonb) to service_role;
