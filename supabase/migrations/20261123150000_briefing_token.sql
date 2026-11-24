-- Rapportens textadress (/api/briefing för genvägar och surfplattor): en nyckel per hushåll ger läsåtkomst till just
-- rapportens data utan inloggning. Nyckeln sparas bara som sha256 (hex). Tabellen har RLS utan policyer (ingen direkt
-- åtkomst); funktionen är security definer, ger bara läsning och bara det hushåll nyckeln hör till.
create table if not exists public.briefing_tokens (
  token_hash text primary key,
  household_id text not null references public.households(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.briefing_tokens enable row level security;
revoke all on public.briefing_tokens from anon, authenticated;

-- Samma rader som hemsidans läsningar (zones, devices, capability_state, net_*, Life360, hitta-prylar), för hushållet
-- som nyckeln hör till. p_caps = vilka capabilities som behövs (CAPS i appen). Null om nyckeln inte finns.
create or replace function public.briefing_rows(p_token text, p_caps text[])
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  hh text;
begin
  select t.household_id into hh from public.briefing_tokens t
   where t.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'utf8')), 'hex');
  if hh is null then return null; end if;
  return jsonb_build_object(
    'zones', coalesce((select jsonb_agg(jsonb_build_object('id', z.id, 'name', z.name, 'parent_id', z.parent_id))
      from public.zones z where z.household_id = hh), '[]'::jsonb),
    'devices', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'zone_id', d.zone_id, 'class', d.class, 'available', d.available, 'driver_id', d.driver_id))
      from public.devices d where d.household_id = hh), '[]'::jsonb),
    'caps', coalesce((select jsonb_agg(jsonb_build_object('device_id', c.device_id, 'capability_id', c.capability_id, 'value_num', c.value_num, 'value_bool', c.value_bool, 'last_updated', c.last_updated))
      from public.capability_state c where c.household_id = hh and c.capability_id = any(coalesce(p_caps, '{}'))), '[]'::jsonb),
    'net_status', (select jsonb_build_object('isp', n.isp, 'wifi_clients', n.wifi_clients, 'wired_clients', n.wired_clients, 'internet_issues', n.internet_issues, 'checked_at', n.checked_at)
      from public.net_status n where n.household_id = hh limit 1),
    'net_isp', coalesce((select jsonb_agg(jsonb_build_object('ts', i.ts, 'latency_ms', i.latency_ms, 'packet_loss', i.packet_loss, 'download_kbps', i.download_kbps, 'upload_kbps', i.upload_kbps, 'uptime', i.uptime, 'downtime', i.downtime) order by i.ts)
      from public.net_isp i where i.household_id = hh and i.ts >= now() - interval '24 hours'), '[]'::jsonb),
    'net_devices', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'name', n.name, 'model', n.model, 'status', n.status, 'firmware_status', n.firmware_status, 'is_console', n.is_console))
      from public.net_devices n where n.household_id = hh), '[]'::jsonb),
    -- Life360: eget hushåll och hushåll som delar (som shared_locate()).
    'shared', coalesce((select jsonb_agg(jsonb_build_object('device_id', d.id, 'name', d.name, 'driver_id', d.driver_id, 'capability_id', c.capability_id, 'value_num', c.value_num, 'value_bool', c.value_bool, 'value_text', c.value_text, 'last_updated', c.last_updated))
      from public.devices d join public.capability_state c on c.device_id = d.id and c.household_id = d.household_id
      where d.available and d.driver_id ilike '%life360%'
        and (d.household_id = hh or d.household_id in (select s.from_household from public.household_shares s where s.to_household = hh and s.what = 'life360'))), '[]'::jsonb),
    -- Hitta-prylar (Apple Watch m.m.): bara eget hushåll.
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'driver_id', d.driver_id))
      from public.devices d where d.household_id = hh and d.available and d.driver_id ilike '%findmy%'), '[]'::jsonb),
    'item_caps', coalesce((select jsonb_agg(jsonb_build_object('device_id', c.device_id, 'capability_id', c.capability_id, 'value_num', c.value_num, 'value_bool', c.value_bool, 'value_text', c.value_text, 'last_updated', c.last_updated))
      from public.capability_state c join public.devices d on d.id = c.device_id and d.household_id = c.household_id
      where d.household_id = hh and d.available and d.driver_id ilike '%findmy%'), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.briefing_rows(text, text[]) from public;
grant execute on function public.briefing_rows(text, text[]) to anon, authenticated;
