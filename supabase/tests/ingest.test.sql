\set ON_ERROR_STOP 1

-- 1: första synk
select public.ingest_homey('{"v":1,"zones":[{"id":"z1","name":"Hem","parent":null},{"id":"z2","name":"Kök","parent":"z1"}],
 "devices":[{"id":"d1","name":"Termometer","zone":"z2","class":"sensor","caps":[
   {"id":"measure_temperature","v":21.5,"u":"°C","s":false,"t":"2026-11-11T10:00:00Z"},
   {"id":"alarm_battery","v":false,"s":false,"t":"2026-11-11T09:00:00Z"},
   {"id":"label","v":"x","t":"2026-11-11T09:00:00Z"}]},
  {"id":"d2","name":"Lampa","zone":"z2","class":"light","caps":[{"id":"onoff","v":true,"s":true,"t":"2026-11-11T10:00:00Z"}]}]}'::jsonb) as run1;
-- 2: samma data igen → inga ändringar
select public.ingest_homey('{"v":1,"zones":[{"id":"z1","name":"Hem"},{"id":"z2","name":"Kök","parent":"z1"}],
 "devices":[{"id":"d1","name":"Termometer","zone":"z2","class":"sensor","caps":[
   {"id":"measure_temperature","v":21.5,"u":"°C","s":false,"t":"2026-11-11T10:00:00Z"},
   {"id":"alarm_battery","v":false,"s":false,"t":"2026-11-11T09:00:00Z"},
   {"id":"label","v":"x","t":"2026-11-11T09:00:00Z"}]},
  {"id":"d2","name":"Lampa","zone":"z2","class":"light","caps":[{"id":"onoff","v":true,"s":true,"t":"2026-11-11T10:00:00Z"}]}]}'::jsonb) as run2;
-- 3: nytt värde, d2 borttagen
select public.ingest_homey('{"v":1,"zones":[],"devices":[{"id":"d1","name":"Termometer","zone":"z2","class":"sensor","caps":[
   {"id":"measure_temperature","v":22,"u":"°C","t":"2026-11-11T10:01:00Z"}]}]}'::jsonb) as run3;
select device_id, capability_id, value_num, value_bool, value_text from capability_state order by 1,2;
select device_id, capability_id, ts, value from readings order by 1,2,3;
select id, available from devices order by 1;
-- anon får inte köra funktionen
set role anon;
do $$ begin perform public.ingest_homey('{}'); raise exception 'anon fick köra'; exception when insufficient_privilege then raise notice 'OK: anon nekas'; end $$;
reset role;
