-- Homey Dashboard POC: ta emot data från HomeyScript (Homey Pro 2019).
-- Endast service role skriver. RLS på, inga policies = ingen åtkomst för anon/authenticated.

create table public.zones (
  id text primary key,
  name text not null,
  parent_id text,
  updated_at timestamptz not null default now()
);

create table public.devices (
  id text primary key,
  name text not null,
  zone_id text,
  class text,
  driver_id text,
  available boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.capability_state (
  device_id text not null references public.devices(id) on delete cascade,
  capability_id text not null,
  value_num double precision,
  value_bool boolean,
  value_text text,
  units text,
  setable boolean not null default false,
  last_updated timestamptz not null,
  received_at timestamptz not null default now(),
  primary key (device_id, capability_id)
);

-- Tidsserie. ts = Homeys lastUpdated, så samma värde som skickas varje minut dedupas av PK.
create table public.readings (
  device_id text not null,
  capability_id text not null,
  ts timestamptz not null,
  value double precision not null,
  primary key (device_id, capability_id, ts)
);
create index readings_ts_brin on public.readings using brin (ts);

create table public.ingest_log (
  id bigint generated always as identity primary key,
  received_at timestamptz not null default now(),
  source text,
  ok boolean not null,
  duration_ms int,
  stats jsonb,
  error text,
  payload jsonb            -- sparas bara vid fel
);
create index ingest_log_received_at on public.ingest_log (received_at desc);

alter table public.zones enable row level security;
alter table public.devices enable row level security;
alter table public.capability_state enable row level security;
alter table public.readings enable row level security;
alter table public.ingest_log enable row level security;

-- Vilka capabilities som loggas som tidsserie.
create or replace function public.is_logged_capability(cap text)
returns boolean language sql immutable set search_path = '' as $$
  select cap like 'measure\_%' or cap like 'meter\_%' or cap like 'alarm\_%'
      or cap in ('onoff', 'dim', 'target_temperature')
$$;

-- Payload v1:
-- { v, source, sent_at,
--   zones:   [{ id, name, parent }],
--   devices: [{ id, name, zone, class, driver, available,
--               caps: [{ id, v, u, s, t }] }] }   -- v=värde u=enhet s=setable t=lastUpdated
create or replace function public.ingest_homey(p jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare
  n_zones int; n_devices int; n_caps int; n_readings int; n_missing int;
begin
  insert into public.zones (id, name, parent_id)
  select z->>'id', z->>'name', z->>'parent'
  from jsonb_array_elements(coalesce(p->'zones', '[]')) z
  where z->>'id' is not null
  on conflict (id) do update
    set name = excluded.name, parent_id = excluded.parent_id, updated_at = now()
    where (zones.name, zones.parent_id) is distinct from (excluded.name, excluded.parent_id);
  get diagnostics n_zones = row_count;

  insert into public.devices (id, name, zone_id, class, driver_id, available)
  select d->>'id', d->>'name', d->>'zone', d->>'class', d->>'driver',
         coalesce((d->>'available')::boolean, true)
  from jsonb_array_elements(coalesce(p->'devices', '[]')) d
  where d->>'id' is not null
  on conflict (id) do update
    set name = excluded.name, zone_id = excluded.zone_id, class = excluded.class,
        driver_id = excluded.driver_id, available = excluded.available, updated_at = now()
    where (devices.name, devices.zone_id, devices.class, devices.driver_id, devices.available)
          is distinct from
          (excluded.name, excluded.zone_id, excluded.class, excluded.driver_id, excluded.available);
  get diagnostics n_devices = row_count;

  -- Enheter som inte längre finns i Homey.
  update public.devices set available = false, updated_at = now()
  where available
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
  where d->>'id' is not null and c->>'id' is not null;

  insert into public.capability_state
    (device_id, capability_id, value_num, value_bool, value_text, units, setable, last_updated)
  select device_id, capability_id, value_num, value_bool, value_text, units, setable,
         coalesce(ts, now())
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

  insert into public.readings (device_id, capability_id, ts, value)
  select device_id, capability_id, ts,
         coalesce(value_num, case when value_bool then 1 else 0 end)
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

revoke all on function public.ingest_homey(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_homey(jsonb) to service_role;
