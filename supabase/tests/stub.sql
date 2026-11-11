-- Minimal Supabase-miljö för lokala tester.
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated, service_role;
create schema auth;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
grant usage on schema auth to anon, authenticated;
create publication supabase_realtime;
create schema vault;
create view vault.decrypted_secrets as select 'homey_ingest_secret'::text as name, 'test-secret'::text as decrypted_secret;
create schema if not exists extensions;
