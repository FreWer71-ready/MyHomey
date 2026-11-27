-- Schemalagd bakgrundshämtning till tabellen snapshots (se /api/refresh). Nyckeln är cron_secret ur Vault.
select cron.schedule('snapshot-trafik-1m', '* * * * *', $$
  select net.http_post(
    url := 'https://trand.se/mydashboard/api/refresh?what=trafik',
    headers := jsonb_build_object('content-type','application/json','x-refresh-secret',(select decrypted_secret from vault.decrypted_secrets where name='cron_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 20000)
$$);
select cron.schedule('snapshot-kalender-10m', '*/10 * * * *', $$
  select net.http_post(
    url := u,
    headers := jsonb_build_object('content-type','application/json','x-refresh-secret',(select decrypted_secret from vault.decrypted_secrets where name='cron_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 30000)
  from unnest(array['https://trand.se/mydashboard/api/refresh?what=cal','https://trand.se/ulrikasdashboard/api/refresh?what=cal']) u
$$);
