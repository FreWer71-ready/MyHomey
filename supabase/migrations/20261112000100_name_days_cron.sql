-- Hämta namnsdagar för i år och nästa år den 1:a varje månad.
select cron.schedule('name-days-monthly', '17 3 1 * *', $$
  select net.http_post(
    url := 'https://swqaqtcjimyoxcyejrrd.supabase.co/functions/v1/name-days',
    headers := jsonb_build_object('content-type','application/json','x-cron-secret', public.get_secret('cron_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 60000);
$$);
