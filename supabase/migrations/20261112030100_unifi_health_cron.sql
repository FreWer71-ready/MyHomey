-- Hämta internet- och nätverkshälsa var 5:e minut.
select cron.schedule('unifi-health-5m', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://swqaqtcjimyoxcyejrrd.supabase.co/functions/v1/unifi-health',
    headers := jsonb_build_object('content-type','application/json','x-cron-secret', public.get_secret('cron_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 30000);
$$);
