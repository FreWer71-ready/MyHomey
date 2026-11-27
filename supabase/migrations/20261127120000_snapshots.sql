-- Bakgrundshämtad data (färdig JSON) som Hem läser med en fråga i stället för att anropa källorna vid varje sidladdning.
-- household_id '*' = gemensam data (Trafikverket); annars per hushåll (kalendern). Bara läsning för inloggade.
create table if not exists public.snapshots (
  household_id text not null,
  key text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (household_id, key)
);
alter table public.snapshots enable row level security;
create policy snapshots_read on public.snapshots for select to authenticated
  using (household_id = '*' or household_id = (select public.my_household()));

-- Skrivning från bakgrundsjobbet (/api/refresh, anropat av pg_cron med cron_secret ur Vault; webben vidarebefordrar
-- bara nyckeln och lagrar ingen egen), inga direkta skrivrättigheter.
create or replace function public.put_snapshot(p_secret text, p_household text, p_key text, p_data jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_secret is null or p_secret <> (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret') then
    return false;
  end if;
  if p_household <> '*' and not exists (select 1 from public.households h where h.id = p_household) then return false; end if;
  if p_key !~ '^[a-z0-9:_-]{1,40}$' then return false; end if;
  insert into public.snapshots (household_id, key, data, updated_at) values (p_household, p_key, p_data, now())
  on conflict (household_id, key) do update set data = excluded.data, updated_at = now();
  return true;
end
$$;
revoke all on function public.put_snapshot(text, text, text, jsonb) from public;
grant execute on function public.put_snapshot(text, text, text, jsonb) to anon, authenticated;

-- "Hämta färsk data" i appen: inloggad användare skriver sitt eget hushålls kalender och den gemensamma trafikdatan.
create or replace function public.put_my_snapshot(p_key text, p_data jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare hh text := public.my_household();
begin
  if hh is null or not public.is_allowed() then return false; end if;
  if p_key = 'trafik' then
    insert into public.snapshots values ('*', p_key, p_data, now())
    on conflict (household_id, key) do update set data = excluded.data, updated_at = now();
  elsif p_key ~ '^cal:[0-9]{1,3}:[0-9]{1,3}$' then
    insert into public.snapshots values (hh, p_key, p_data, now())
    on conflict (household_id, key) do update set data = excluded.data, updated_at = now();
  else
    return false;
  end if;
  return true;
end
$$;
revoke all on function public.put_my_snapshot(text, jsonb) from public, anon;
grant execute on function public.put_my_snapshot(text, jsonb) to authenticated;
