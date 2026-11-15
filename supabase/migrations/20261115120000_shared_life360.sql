-- Delad Life360-data mellan hushåll (Fredrik och Ulrika är i samma Life360-krets).
-- household_shares säger vem som delar vad; shared_locate() returnerar Life360-medlemmar från det egna hushållet
-- och från hushåll som delar med en. Inget annat (Hitta-prylar, sensorer) delas.
create table if not exists public.household_shares (
  from_household text not null references public.households(id),
  to_household text not null references public.households(id),
  what text not null check (what in ('life360')),
  primary key (from_household, to_household, what)
);
alter table public.household_shares enable row level security;
-- Ingen läsning för klienter; bara funktionen nedan använder tabellen.

insert into public.household_shares values ('fredrik', 'ulrika', 'life360'), ('ulrika', 'fredrik', 'life360')
on conflict do nothing;

create or replace function public.shared_locate()
returns table (device_id text, name text, driver_id text, capability_id text,
               value_num double precision, value_bool boolean, value_text text, last_updated timestamptz)
language sql stable security definer set search_path = '' as $$
  with me as (select public.my_household() hh),
  hh as (
    select hh from me
    union select s.from_household from public.household_shares s, me where s.to_household = me.hh and s.what = 'life360'
  )
  select d.id, d.name, d.driver_id, c.capability_id, c.value_num, c.value_bool, c.value_text, c.last_updated
  from public.devices d
  join public.capability_state c on c.device_id = d.id
  where d.household_id in (select hh from hh) and d.available and d.driver_id ilike '%life360%'
    and (select public.is_allowed())
$$;
revoke all on function public.shared_locate() from public, anon;
grant execute on function public.shared_locate() to authenticated;
