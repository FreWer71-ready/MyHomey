-- Tågresor: borttagna ("fel tåg") döljs i stället för att raderas, så att tågläget inte sparar dem igen.
-- source: hur resan hittades (user = bekräftad, gps = tågets GPS, guess = gissad ur positionen).
alter table public.train_trips add column if not exists hidden boolean not null default false;
alter table public.train_trips add column if not exists source text not null default 'user' check (source in ('user','gps','guess'));
