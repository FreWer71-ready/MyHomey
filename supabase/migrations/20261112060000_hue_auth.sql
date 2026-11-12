-- Philips Hue Remote API: OAuth-tokens och bryggans applikationsnyckel.
-- RLS utan policyer: bara service role (edge-funktionen hue) kommer åt raden.
create table public.hue_auth (
  id int primary key default 1 check (id = 1),
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  app_key text,
  updated_at timestamptz not null default now()
);
alter table public.hue_auth enable row level security;
revoke all on public.hue_auth from anon, authenticated;
