-- Inloggning, läsrättigheter, Realtime och brusfilter.

-- 1. Vilka e-postadresser får använda dashboarden (fylls i manuellt, inte i git).
create table public.app_users (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);
alter table public.app_users enable row level security;

create or replace function public.is_allowed()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_users where email = lower(auth.jwt()->>'email'))
$$;
revoke all on function public.is_allowed() from public, anon;
grant execute on function public.is_allowed() to authenticated;

-- Före inloggning: får den här adressen få en inloggningslänk?
create or replace function public.is_email_allowed(e text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_users where email = lower(trim(e)))
$$;
revoke all on function public.is_email_allowed(text) from public;
grant execute on function public.is_email_allowed(text) to anon, authenticated;

-- 2. Läsrättigheter för inloggade och godkända användare.
create policy zones_read on public.zones for select to authenticated using ((select public.is_allowed()));
create policy devices_read on public.devices for select to authenticated using ((select public.is_allowed()));
create policy capability_state_read on public.capability_state for select to authenticated using ((select public.is_allowed()));
create policy readings_read on public.readings for select to authenticated using ((select public.is_allowed()));

-- 3. Realtime: webbappen uppdateras när värden ändras.
alter publication supabase_realtime add table public.capability_state;

-- 4. Brus: capabilities som ändras hela tiden utan värde för dashboarden.
create table public.ignored_capabilities (
  capability_id text primary key,
  reason text
);
alter table public.ignored_capabilities enable row level security;
insert into public.ignored_capabilities (capability_id, reason) values
  ('measure_presence_override_remaining', 'Smart Presence nedräkning, ändras varje minut');
delete from public.capability_state where capability_id in (select capability_id from public.ignored_capabilities);

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
  where d->>'id' is not null and c->>'id' is not null
    and c->>'id' not in (select capability_id from public.ignored_capabilities);

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
