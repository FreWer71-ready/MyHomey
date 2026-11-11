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
