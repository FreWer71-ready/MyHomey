-- Synka Hue-hushåll (lampor, sensorer, scener) var 2:a minut.
select cron.schedule('hue-sync-2m', '*/2 * * * *', $$
  select net.http_post(
    url := 'https://swqaqtcjimyoxcyejrrd.supabase.co/functions/v1/hue',
    headers := jsonb_build_object('content-type','application/json','x-cron-secret', public.get_secret('cron_secret')),
    body := '{"action":"sync"}'::jsonb, timeout_milliseconds := 30000);
$$);
