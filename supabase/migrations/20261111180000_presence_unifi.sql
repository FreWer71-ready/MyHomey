-- Närvaro via UniFi: anslutna wifi-klienter → personer.

-- (pg_cron finns inte i lokal testmiljö)
do $$ begin create extension if not exists pg_cron; exception when others then null; end $$;
do $$ begin create extension if not exists pg_net with schema extensions; exception when others then null; end $$;

-- Alla klienter UniFi känner till (nyckel: MAC, visas med namn).
create table public.network_clients (
  mac text primary key,
  name text,
  ip text,
  type text,                 -- WIRED / WIRELESS
  connected boolean not null default false,
  last_seen timestamptz,
  updated_at timestamptz not null default now()
);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort int not null default 0
);

-- Vilken enhet tillhör vem. Saknas rad matchas på namn (t.ex. "Mollys iPhone" → Molly).
create table public.client_alias (
  mac text primary key,
  person_id uuid references public.people(id) on delete cascade,
  alias text,
  ignore boolean not null default false   -- t.ex. en surfplatta som alltid är hemma
);

alter table public.network_clients enable row level security;
alter table public.people enable row level security;
alter table public.client_alias enable row level security;
create policy network_clients_read on public.network_clients for select to authenticated using ((select public.is_allowed()));
create policy people_read on public.people for select to authenticated using ((select public.is_allowed()));
create policy client_alias_read on public.client_alias for select to authenticated using ((select public.is_allowed()));

-- Personens enheter: uttryckligt alias, annars namnmatchning.
create or replace view public.v_person_devices with (security_invoker = true) as
select p.id as person_id, c.mac, coalesce(a.alias, c.name) as device_name, c.connected, c.last_seen
from public.people p
join public.network_clients c on true
left join public.client_alias a on a.mac = c.mac
where coalesce(a.ignore, false) = false
  and (a.person_id = p.id
       or (a.person_id is null and c.name ilike '%' || p.name || '%'));

create or replace view public.v_presence with (security_invoker = true) as
select p.id, p.name, p.sort,
       coalesce(bool_or(d.last_seen > now() - interval '10 minutes'), false) as home,
       max(d.last_seen) as last_seen,
       count(d.mac) as devices
from public.people p
left join public.v_person_devices d on d.person_id = p.id
group by p.id, p.name, p.sort;

-- Tar emot listan över anslutna klienter (från unifi-sync).
create or replace function public.ingest_unifi(clients jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare n_seen int; n_left int;
begin
  insert into public.network_clients (mac, name, ip, type, connected, last_seen)
  select lower(c->>'mac'), c->>'name', c->>'ip', c->>'type', true, now()
  from jsonb_array_elements(clients) c
  where c->>'mac' is not null
  on conflict (mac) do update
    set name = coalesce(excluded.name, network_clients.name), ip = excluded.ip, type = excluded.type,
        connected = true, last_seen = now(), updated_at = now();
  get diagnostics n_seen = row_count;

  update public.network_clients set connected = false, updated_at = now()
  where connected and mac not in (select lower(c->>'mac') from jsonb_array_elements(clients) c where c->>'mac' is not null);
  get diagnostics n_left = row_count;

  return jsonb_build_object('connected', n_seen, 'disconnected', n_left);
end
$$;
revoke all on function public.ingest_unifi(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_unifi(jsonb) to service_role;

-- Hemligheter för Edge Function (endast service_role).
create or replace function public.get_secret(secret_name text)
returns text language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = secret_name
$$;
revoke all on function public.get_secret(text) from public, anon, authenticated;
grant execute on function public.get_secret(text) to service_role;
