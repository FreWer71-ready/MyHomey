-- Kommandon: även enskilda lampor (ljusstyrka, färgtemperatur, färg).
alter table public.commands drop constraint commands_type_check;
alter table public.commands add constraint commands_type_check check (type in ('scene', 'mood', 'flow', 'light'));
alter table public.commands add column device_id text;
alter table public.commands add column payload jsonb;
