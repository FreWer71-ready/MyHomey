\set ON_ERROR_STOP 1
insert into public.app_users values ('ok@example.com');
select public.ingest_homey('{"zones":[{"id":"z1","name":"Kök"}],"devices":[{"id":"d1","name":"Lampa","zone":"z1","class":"light","caps":[{"id":"onoff","v":true,"t":"2026-11-11T10:00:00Z"},{"id":"measure_presence_override_remaining","v":5,"t":"2026-11-11T10:00:00Z"}]}]}'::jsonb) as ingest;
do $$ begin
  if exists (select 1 from public.capability_state where capability_id = 'measure_presence_override_remaining') then raise exception 'brus sparades'; end if;
end $$;
set role authenticated;
set request.jwt.claims = '{"email":"OK@example.com"}';
do $$ begin if (select count(*) from public.capability_state) <> 1 then raise exception 'godkänd användare ser inte data'; end if; end $$;
set request.jwt.claims = '{"email":"fel@example.com"}';
do $$ begin if (select count(*) from public.capability_state) <> 0 then raise exception 'ej godkänd ser data'; end if; end $$;
do $$ begin if (select count(*) from public.app_users) <> 0 then raise exception 'app_users läcker'; end if; end $$;
reset role;
set role anon;
do $$ begin
  if not public.is_email_allowed(' Ok@Example.com ') then raise exception 'is_email_allowed fel'; end if;
  if public.is_email_allowed('x@example.com') then raise exception 'is_email_allowed släpper igenom'; end if;
  if (select count(*) from public.devices) <> 0 then raise exception 'anon ser data'; end if;
end $$;
reset role;
\echo RLS-test OK

-- Moods: ersätts helt, ignoreras utan nyckel, läsbara för godkänd användare.
do $$ begin
  if public.ingest_moods('{"moods":[{"id":"m1","name":"Mys","zone":"z1"},{"id":"m2","name":"Film","zone":"z1"}]}') <> 2 then raise exception 'moods insert'; end if;
  if public.ingest_moods('{"moods":[{"id":"m2","name":"Bio","zone":"z1"}]}') <> 1 then raise exception 'moods ersätts inte'; end if;
  if public.ingest_moods('{}') is not null then raise exception 'moods utan nyckel'; end if;
  if (select name from public.moods where id = 'm2') <> 'Bio' then raise exception 'moods uppdateras inte'; end if;
  perform public.ingest_moods('{"moods":[{"id":"m2","name":"Bio","zone":"z1","favorite":true}]}');
  if not (select favorite from public.moods where id = 'm2') then raise exception 'favorit sparas inte'; end if;
  if public.ingest_flows('{"flows":[{"id":"f1","name":"Godnatt"},{"id":"f2","name":"Bio","advanced":true}]}') <> 2 then raise exception 'flows insert'; end if;
  if public.ingest_flows('{"flows":[{"id":"f2","name":"Bio","advanced":true}]}') <> 1 then raise exception 'flows ersätts inte'; end if;
end $$;
set role authenticated;
set request.jwt.claims = '{"email":"ok@example.com"}';
do $$ begin if (select count(*) from public.moods) <> 1 then raise exception 'godkänd ser inte moods'; end if; end $$;
reset role;
\echo Moods-test OK

-- Närvaro: namnmatchning, alias, ignorerade enheter, frånkopplade.
insert into public.people (name, sort) values ('Molly', 1), ('Wilmer', 2), ('Fredrik', 3);
select public.ingest_unifi('[{"mac":"AA","name":"Mollys iPhone"},{"mac":"BB","name":"iPhone 15"},{"mac":"CC","name":"Wilmer-pc"},{"mac":"DD","name":"Fredrik iPad"}]');
insert into public.client_alias (mac, person_id) select 'bb', id from public.people where name = 'Fredrik';
insert into public.client_alias (mac, ignore) values ('dd', true);
select public.ingest_unifi('[{"mac":"AA","name":"Mollys iPhone"},{"mac":"BB","name":"iPhone 15"}]');
update public.network_clients set last_seen = now() - interval '1 hour' where mac = 'cc';
do $$ declare r record; begin
  for r in select name, home, devices from public.v_presence order by sort loop
    raise notice '% hemma=% enheter=%', r.name, r.home, r.devices;
  end loop;
  if not (select home from public.v_presence where name = 'Molly') then raise exception 'Molly borde vara hemma'; end if;
  if (select home from public.v_presence where name = 'Wilmer') then raise exception 'Wilmer borde vara borta'; end if;
  if not (select home from public.v_presence where name = 'Fredrik') then raise exception 'alias fungerar inte'; end if;
  if (select devices from public.v_presence where name = 'Fredrik') <> 1 then raise exception 'ignorerad enhet räknas'; end if;
  if (select connected from public.network_clients where mac = 'cc') then raise exception 'frånkopplad markeras inte'; end if;
end $$;
set role authenticated;
set request.jwt.claims = '{"email":"ok@example.com"}';
do $$ begin if (select count(*) from public.v_presence) <> 3 then raise exception 'godkänd ser inte närvaro'; end if; end $$;
set request.jwt.claims = '{"email":"fel@example.com"}';
do $$ begin if (select count(*) from public.v_presence) <> 0 then raise exception 'närvaro läcker'; end if; end $$;
reset role;
\echo Närvaro-test OK

-- Historik: intervall, RLS gäller (security invoker).
insert into public.readings values ('d1','measure_temperature', now() - interval '50 minutes', 20),
  ('d1','measure_temperature', now() - interval '45 minutes', 22), ('d1','measure_temperature', now() - interval '5 minutes', 25);
set role authenticated;
set request.jwt.claims = '{"email":"ok@example.com"}';
do $$ begin
  if (select count(*) from public.history('measure_temperature', now() - interval '1 hour', '30 minutes')) not between 2 and 3 then raise exception 'history intervall'; end if;
  if (select max(vmax) from public.history('measure_temperature', now() - interval '1 hour', '1 hour')) <> 25 then raise exception 'history max'; end if;
end $$;
set request.jwt.claims = '{"email":"fel@example.com"}';
do $$ begin if exists (select 1 from public.history('measure_temperature', now() - interval '1 hour', '1 hour')) then raise exception 'history läcker'; end if; end $$;
reset role;
\echo Historik-test OK

-- Tidslinje: läget före perioden + ändringar.
insert into public.readings values ('d1','onoff', now() - interval '3 hours', 1), ('d1','onoff', now() - interval '30 minutes', 0),
  ('d1','onoff', now() - interval '10 minutes', 1);
set role authenticated;
set request.jwt.claims = '{"email":"ok@example.com"}';
do $$ begin
  if (select count(*) from public.onoff_timeline(now() - interval '1 hour')) <> 3 then raise exception 'tidslinje antal'; end if;
  if (select value from public.onoff_timeline(now() - interval '1 hour') order by ts limit 1) <> 1 then raise exception 'tidslinje startläge'; end if;
end $$;
reset role;
\echo Tidslinje-test OK

-- Historik: värde före perioden tas med som startpunkt.
insert into public.readings values ('d1','measure_humidity', now() - interval '3 days', 40);
set role authenticated;
set request.jwt.claims = '{"email":"ok@example.com"}';
do $$ begin
  if (select count(*) from public.history('measure_humidity', now() - interval '1 day', '1 hour')) <> 1 then raise exception 'startvärde saknas'; end if;
end $$;
reset role;
\echo Startvärde-test OK

-- Flera hushåll: Ulrika ser bara sitt, Fredrik bara sitt.
reset role;
insert into public.app_users (email, household_id) values ('u@example.com', 'ulrika') on conflict (email) do update set household_id = 'ulrika';
select public.ingest_homey('{"household":"ulrika","zones":[{"id":"uz","name":"Hall"}],"devices":[{"id":"ud","name":"Lampa U","zone":"uz","class":"light","caps":[{"id":"onoff","v":true,"t":"2026-11-12T10:00:00Z"}]}]}'::jsonb);
-- Fredriks ingest får inte markera Ulrikas enheter som saknade.
select public.ingest_homey('{"zones":[],"devices":[]}'::jsonb);
do $$ begin if not (select available from public.devices where id = 'ud') then raise exception 'annat hushålls enhet markerades saknad'; end if; end $$;
set role authenticated;
set request.jwt.claims = '{"email":"u@example.com"}';
do $$ begin
  if (select count(*) from public.devices) <> 1 then raise exception 'ulrika ser fel antal enheter'; end if;
  if (select count(*) from public.readings where device_id <> 'ud') <> 0 then raise exception 'ulrika ser andras historik'; end if;
end $$;
set request.jwt.claims = '{"email":"ok@example.com"}';
do $$ begin if exists (select 1 from public.devices where id = 'ud') then raise exception 'fredrik ser ulrikas enhet'; end if; end $$;
reset role;
