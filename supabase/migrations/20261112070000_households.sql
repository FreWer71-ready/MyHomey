-- Flera hushåll i samma databas. Varje rad märks med household_id och RLS visar bara
-- användarens eget hushåll (app_users.household_id). Befintliga data hör till 'fredrik'.

create table public.households (
  id text primary key,
  name text not null,
  source text not null check (source in ('homey', 'hue')),
  created_at timestamptz not null default now()
);
alter table public.households enable row level security;
insert into public.households (id, name, source) values ('fredrik', 'Fredrik', 'homey'), ('ulrika', 'Ulrika', 'hue');

alter table public.app_users add column household_id text not null default 'fredrik' references public.households (id);

/** Inloggad användares hushåll (null för okända). */
create or replace function public.my_household()
returns text language sql stable security definer set search_path = '' as $$
  select household_id from public.app_users where email = lower(auth.jwt()->>'email')
$$;
revoke all on function public.my_household() from public, anon;
grant execute on function public.my_household() to authenticated;

create policy households_read on public.households for select to authenticated using (id = (select public.my_household()));

-- household_id på alla hushållsdata (konstant standardvärde: snabbt även på stora tabeller).
do $$
declare t text;
begin
  foreach t in array array['zones','devices','capability_state','readings','moods','flows','commands','ingest_log',
                           'net_isp','net_devices','net_status','people','client_alias','network_clients'] loop
    execute format('alter table public.%I add column household_id text not null default %L', t, 'fredrik');
  end loop;
end $$;
create index devices_household on public.devices (household_id);
create index capability_state_household on public.capability_state (household_id);

-- Läsregler: eget hushåll i stället för "alla godkända".
do $$
declare t text;
begin
  foreach t in array array['zones','devices','capability_state','readings','moods','flows','commands',
                           'net_isp','net_devices','net_status','people','client_alias','network_clients'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (household_id = (select public.my_household()))', t || '_read', t);
  end loop;
end $$;

-- Kommandon från webben hamnar i användarens hushåll.
alter table public.commands alter column household_id set default public.my_household();
drop policy if exists commands_insert on public.commands;
create policy commands_insert on public.commands for insert to authenticated
  with check (household_id = (select public.my_household()) and created_by = (select auth.uid()));

-- Hue-inloggning per hushåll (befintlig rad, om någon, hör till fredrik).
alter table public.hue_auth add column household_id text not null default 'fredrik';
alter table public.hue_auth drop constraint hue_auth_pkey;
alter table public.hue_auth drop constraint if exists hue_auth_id_check;
alter table public.hue_auth drop column id;
alter table public.hue_auth add primary key (household_id);

-- Ingest per hushåll: p.household (standard 'fredrik'). Allt som tas bort/markeras saknat
-- gäller bara det egna hushållet.
create or replace function public.ingest_homey(p jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare
  hh text := coalesce(p->>'household', 'fredrik');
  n_zones int; n_devices int; n_caps int; n_readings int; n_missing int;
begin
  insert into public.zones (id, name, parent_id, household_id)
  select z->>'id', z->>'name', z->>'parent', hh
  from jsonb_array_elements(coalesce(p->'zones', '[]')) z
  where z->>'id' is not null
  on conflict (id) do update
    set name = excluded.name, parent_id = excluded.parent_id, updated_at = now()
    where (zones.name, zones.parent_id) is distinct from (excluded.name, excluded.parent_id);
  get diagnostics n_zones = row_count;

  insert into public.devices (id, name, zone_id, class, driver_id, available, household_id)
  select d->>'id', d->>'name', d->>'zone', d->>'class', d->>'driver',
         coalesce((d->>'available')::boolean, true), hh
  from jsonb_array_elements(coalesce(p->'devices', '[]')) d
  where d->>'id' is not null
  on conflict (id) do update
    set name = excluded.name, zone_id = excluded.zone_id, class = excluded.class,
        driver_id = excluded.driver_id, available = excluded.available, updated_at = now()
    where (devices.name, devices.zone_id, devices.class, devices.driver_id, devices.available)
          is distinct from
          (excluded.name, excluded.zone_id, excluded.class, excluded.driver_id, excluded.available);
  get diagnostics n_devices = row_count;

  update public.devices set available = false, updated_at = now()
  where available and household_id = hh
    and id not in (select d->>'id' from jsonb_array_elements(coalesce(p->'devices', '[]')) d
                   where d->>'id' is not null);
  get diagnostics n_missing = row_count;

  create temp table _caps on commit drop as
  select d->>'id' as device_id,
         c->>'id' as capability_id,
         case when jsonb_typeof(c->'v') = 'number'  then (c->>'v')::double precision end as value_num,
         case when jsonb_typeof(c->'v') = 'boolean' then (c->>'v')::boolean end as value_bool,
         case when jsonb_typeof(c->'v') = 'string'  then c->>'v' end as value_text,
         c->>'u' as units,
         coalesce((c->>'s')::boolean, false) as setable,
         (c->>'t')::timestamptz as ts
  from jsonb_array_elements(coalesce(p->'devices', '[]')) d,
       jsonb_array_elements(coalesce(d->'caps', '[]')) c
  where d->>'id' is not null and c->>'id' is not null
    and c->>'id' not in (select capability_id from public.ignored_capabilities);

  insert into public.capability_state
    (device_id, capability_id, value_num, value_bool, value_text, units, setable, last_updated, household_id)
  select device_id, capability_id, value_num, value_bool, value_text, units, setable, coalesce(ts, now()), hh
  from _caps
  on conflict (device_id, capability_id) do update
    set value_num = excluded.value_num, value_bool = excluded.value_bool,
        value_text = excluded.value_text, units = excluded.units, setable = excluded.setable,
        last_updated = excluded.last_updated, received_at = now()
    where (capability_state.value_num, capability_state.value_bool, capability_state.value_text,
           capability_state.last_updated)
          is distinct from
          (excluded.value_num, excluded.value_bool, excluded.value_text, excluded.last_updated);
  get diagnostics n_caps = row_count;

  insert into public.readings (device_id, capability_id, ts, value, household_id)
  select device_id, capability_id, ts, coalesce(value_num, case when value_bool then 1 else 0 end), hh
  from _caps
  where ts is not null
    and (value_num is not null or value_bool is not null)
    and public.is_logged_capability(capability_id)
  on conflict do nothing;
  get diagnostics n_readings = row_count;

  return jsonb_build_object(
    'zones_changed', n_zones, 'devices_changed', n_devices, 'devices_missing', n_missing,
    'caps_changed', n_caps, 'readings_inserted', n_readings);
end
$$;

create or replace function public.ingest_moods(p jsonb)
returns int language plpgsql set search_path = '' as $$
declare
  hh text := coalesce(p->>'household', 'fredrik');
  n int;
begin
  if jsonb_typeof(p->'moods') is distinct from 'array' then return null; end if;

  insert into public.moods (id, name, zone_id, favorite, household_id)
  select m->>'id', m->>'name', m->>'zone', coalesce((m->>'favorite')::boolean, false), hh
  from jsonb_array_elements(p->'moods') m
  where m->>'id' is not null and m->>'name' is not null
  on conflict (id) do update
    set name = excluded.name, zone_id = excluded.zone_id, favorite = excluded.favorite, updated_at = now()
    where (moods.name, moods.zone_id, moods.favorite) is distinct from (excluded.name, excluded.zone_id, excluded.favorite);

  delete from public.moods
  where household_id = hh
    and id not in (select m->>'id' from jsonb_array_elements(p->'moods') m where m->>'id' is not null);

  select count(*) into n from public.moods where household_id = hh;
  return n;
end
$$;

create or replace function public.ingest_flows(p jsonb)
returns int language plpgsql set search_path = '' as $$
declare
  hh text := coalesce(p->>'household', 'fredrik');
  n int;
begin
  if jsonb_typeof(p->'flows') is distinct from 'array' then return null; end if;

  insert into public.flows (id, name, advanced, household_id)
  select f->>'id', f->>'name', coalesce((f->>'advanced')::boolean, false), hh
  from jsonb_array_elements(p->'flows') f
  where f->>'id' is not null and f->>'name' is not null
  on conflict (id) do update
    set name = excluded.name, advanced = excluded.advanced, updated_at = now()
    where (flows.name, flows.advanced) is distinct from (excluded.name, excluded.advanced);

  delete from public.flows
  where household_id = hh
    and id not in (select f->>'id' from jsonb_array_elements(p->'flows') f where f->>'id' is not null);

  select count(*) into n from public.flows where household_id = hh;
  return n;
end
$$;

-- Ulrika: inloggning för hushållet 'ulrika'.
insert into public.app_users (email, household_id) values ('usv136@gmail.com', 'ulrika') on conflict (email) do update set household_id = excluded.household_id;
