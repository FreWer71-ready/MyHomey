-- Kommandon: även moods.
alter table public.commands drop constraint commands_type_check;
alter table public.commands add constraint commands_type_check check (type in ('scene', 'mood'));
alter table public.commands add column mood_id text;
