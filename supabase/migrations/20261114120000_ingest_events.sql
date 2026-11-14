-- Händelser från Homey Insights (t.ex. alarm_contact): varje ändring, även korta öppningar mellan
-- minutsnapshotarna. Skrivs till readings; PK (device, capability, ts) gör omsändning ofarlig.
create or replace function public.ingest_events(p jsonb)
returns integer language plpgsql set search_path = '' as $$
declare
  hh text := coalesce(p->>'household', 'fredrik');
  n int;
begin
  if jsonb_typeof(p->'events') is distinct from 'array' then return null; end if;
  insert into public.readings (device_id, capability_id, ts, value, household_id)
  select e->>'device', e->>'cap', (e->>'t')::timestamptz,
         case jsonb_typeof(e->'v') when 'boolean' then case when (e->>'v')::boolean then 1 else 0 end
                                   when 'number' then (e->>'v')::double precision end,
         hh
  from jsonb_array_elements(p->'events') e
  where e->>'device' is not null and e->>'cap' is not null and e->>'t' is not null
    and jsonb_typeof(e->'v') in ('boolean', 'number')
    and public.is_logged_capability(e->>'cap')
    and exists (select 1 from public.devices d where d.id = e->>'device' and d.household_id = hh)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end
$$;
revoke all on function public.ingest_events(jsonb) from public, anon, authenticated;
