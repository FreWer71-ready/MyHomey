-- Homeys logikvariabler (t.ex. "Auto På" = Ja/Nej) för att visa läget på snabbvalsknappar.
-- Skrivs av homey-ingest (service role) via ingest_variables(); läses per hushåll.
create table if not exists public.homey_variables (
  household_id text not null default public.my_household(),
  id text not null,
  name text not null,
  type text not null check (type in ('boolean', 'number', 'string')),
  value_bool boolean,
  value_num double precision,
  value_text text,
  updated_at timestamptz not null default now(),
  primary key (household_id, id)
);
alter table public.homey_variables enable row level security;
create policy homey_variables_read on public.homey_variables for select to authenticated
  using (household_id = (select public.my_household()));

create or replace function public.ingest_variables(p jsonb)
returns integer language plpgsql set search_path to '' as $$
declare
  hh text := coalesce(p->>'household', 'fredrik');
  n int;
begin
  if jsonb_typeof(p->'variables') is distinct from 'array' then return null; end if;
  insert into public.homey_variables (household_id, id, name, type, value_bool, value_num, value_text)
  select hh, v->>'id', v->>'name', v->>'type',
    case when v->>'type' = 'boolean' then (v->>'value')::boolean end,
    case when v->>'type' = 'number' then (v->>'value')::double precision end,
    case when v->>'type' = 'string' then left(v->>'value', 500) end
  from jsonb_array_elements(p->'variables') v
  where v->>'id' is not null and v->>'name' is not null and v->>'type' in ('boolean', 'number', 'string')
  on conflict (household_id, id) do update
    set name = excluded.name, type = excluded.type, value_bool = excluded.value_bool,
        value_num = excluded.value_num, value_text = excluded.value_text, updated_at = now();
  delete from public.homey_variables
  where household_id = hh and id not in (select v->>'id' from jsonb_array_elements(p->'variables') v where v->>'id' is not null);
  select count(*) into n from public.homey_variables where household_id = hh;
  return n;
end
$$;
revoke all on function public.ingest_variables(jsonb) from public, anon, authenticated;
