-- När TV-läget senast ändrades (updated_at är senaste livstecken). Dashboarden visar enheten som ändrades senast.
alter table public.tv_status add column if not exists changed_at timestamptz not null default now();
comment on column public.tv_status.changed_at is 'När innehållet (på/av, app, titel, status) senast ändrades; updated_at är senaste livstecken.';
