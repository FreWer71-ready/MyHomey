-- Hämta spotpriser varje timme (:07). Morgondagens priser publiceras ca 13.
select cron.schedule('spot-prices-hourly', '7 * * * *', $$
  select net.http_post(
    url := 'https://swqaqtcjimyoxcyejrrd.supabase.co/functions/v1/spot-prices',
    headers := jsonb_build_object('content-type','application/json','x-cron-secret', public.get_secret('cron_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 30000);
$$);
