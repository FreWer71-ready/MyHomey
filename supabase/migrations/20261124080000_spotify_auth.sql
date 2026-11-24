-- Spotify (Web API): OAuth-nycklar per hushåll för att styra uppspelning på högtalare (Spotify Connect).
-- RLS utan policyer: bara service role (edge-funktionen spotify) kommer åt raderna.
create table public.spotify_auth (
  household_id text primary key references public.households (id),
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.spotify_auth enable row level security;
revoke all on public.spotify_auth from anon, authenticated;
