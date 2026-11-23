\set ON_ERROR_STOP 1
-- Rapportens nyckel: ger bara det egna hushållets rader, fel nyckel ger inget, tabellen går inte att läsa direkt.
insert into public.households (id, name, source) values ('ta', 'TA', 'homey'), ('tb', 'TB', 'hue') on conflict do nothing;
insert into public.zones (id, name, household_id) values ('bz1', 'Kök', 'ta'), ('bz2', 'Annat', 'tb');
insert into public.devices (id, name, zone_id, class, available, driver_id, household_id) values
  ('bd1', 'Lampa', 'bz1', 'light', true, 'homey:x', 'ta'), ('bd2', 'Annan lampa', 'bz2', 'light', true, 'hue', 'tb'),
  ('bl1', 'Fredrik', null, 'sensor', true, 'life360', 'ta'), ('bl2', 'Ulrika', null, 'sensor', true, 'life360', 'tb'),
  ('bf1', 'Apple Watch', null, 'other', true, 'findmy', 'ta');
insert into public.capability_state (device_id, capability_id, value_bool, value_num, value_text, household_id, last_updated) values
  ('bd1', 'onoff', true, null, null, 'ta', now()), ('bd1', 'hemlig_cap', true, null, null, 'ta', now()), ('bd2', 'onoff', true, null, null, 'tb', now()),
  ('bl1', 'life360_place', null, null, 'Hem', 'ta', now()), ('bl2', 'life360_place', null, null, 'Jobbet', 'tb', now()),
  ('bf1', 'measure_battery', null, 3, null, 'ta', now());
insert into public.briefing_tokens (token_hash, household_id) values (encode(sha256(convert_to('nyckel-a', 'utf8')), 'hex'), 'ta');

set role anon;
do $$
declare r jsonb;
begin
  r := public.briefing_rows('nyckel-a', array['onoff', 'measure_battery']);
  if r is null then raise exception 'rätt nyckel ger inget'; end if;
  if jsonb_array_length(r->'zones') <> 1 or r->'zones'->0->>'name' <> 'Kök' then raise exception 'zoner: %', r->'zones'; end if;
  if jsonb_array_length(r->'devices') <> 3 then raise exception 'enheter: %', r->'devices'; end if;
  -- Bara efterfrågade capabilities (onoff och batteriet), bara eget hushåll: inte hemlig_cap och inte TB:s lampa.
  if jsonb_array_length(r->'caps') <> 2 or exists (select 1 from jsonb_array_elements(r->'caps') c where c->>'capability_id' = 'hemlig_cap' or c->>'device_id' = 'bd2') then raise exception 'caps: %', r->'caps'; end if;
  if jsonb_array_length(r->'shared') <> 1 or r->'shared'->0->>'value_text' <> 'Hem' then raise exception 'Life360: %', r->'shared'; end if;
  if jsonb_array_length(r->'items') <> 1 or jsonb_array_length(r->'item_caps') <> 1 then raise exception 'hitta-prylar'; end if;
  if public.briefing_rows('fel-nyckel', array['onoff']) is not null then raise exception 'fel nyckel släpps in'; end if;
  if public.briefing_rows('', array['onoff']) is not null then raise exception 'tom nyckel släpps in'; end if;
  if public.briefing_rows(null, null) is not null then raise exception 'null-nyckel släpps in'; end if;
  begin
    perform count(*) from public.briefing_tokens;
    raise exception 'anon kan läsa briefing_tokens';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
\echo Rapport-test OK
