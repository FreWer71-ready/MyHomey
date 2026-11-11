-- Hemligheten ligger i Vault (namn: homey_ingest_secret). Sätts manuellt:
--   select vault.create_secret('<värde>', 'homey_ingest_secret', 'HomeyScript → homey-ingest');
create or replace function public.verify_ingest_secret(s text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'homey_ingest_secret' and decrypted_secret = s
  )
$$;
revoke all on function public.verify_ingest_secret(text) from public, anon, authenticated;
grant execute on function public.verify_ingest_secret(text) to service_role;
