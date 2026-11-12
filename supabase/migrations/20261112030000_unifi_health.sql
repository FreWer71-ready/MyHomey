-- Internet- och nätverkshälsa från UniFi Site Manager (edge-funktionen unifi-health).
create table public.net_isp (
  ts timestamptz primary key,
  latency_ms real,
  max_latency_ms real,
  packet_loss real,
  download_kbps int,
  upload_kbps int,
  uptime real,
  downtime real,
  isp text
);
create table public.net_devices (
  id text primary key,
  name text not null,
  model text,
  status text,
  version text,
  firmware_status text,
  is_console boolean not null default false,
  startup_time timestamptz,
  updated_at timestamptz not null default now()
);
-- En rad: senaste sammanfattningen.
create table public.net_status (
  id int primary key default 1 check (id = 1),
  isp text,
  wifi_clients int,
  wired_clients int,
  offline_devices int,
  pending_updates int,
  internet_issues jsonb,
  checked_at timestamptz not null default now()
);
alter table public.net_isp enable row level security;
alter table public.net_devices enable row level security;
alter table public.net_status enable row level security;
create policy net_isp_read on public.net_isp for select to authenticated using ((select public.is_allowed()));
create policy net_devices_read on public.net_devices for select to authenticated using ((select public.is_allowed()));
create policy net_status_read on public.net_status for select to authenticated using ((select public.is_allowed()));
