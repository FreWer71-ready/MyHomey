// Internet- och nätverkshälsa (UniFi) till vyerna. Ren logik.

export type NetIsp = { ts: string; latency_ms: number | null; packet_loss: number | null; download_kbps: number | null; upload_kbps: number | null; uptime: number | null; downtime: number | null };
export type NetDevice = { id: string; name: string; model: string | null; status: string | null; firmware_status: string | null; is_console: boolean };
export type NetStatusRow = { isp: string | null; wifi_clients: number | null; wired_clients: number | null; internet_issues: unknown[] | null; checked_at: string };

export type Net = {
  /** ok, långsamt, nere, eller okänt (synken mot UniFi har stannat). */
  state: 'ok' | 'slow' | 'down' | 'unknown';
  isp: string | null;
  latency: number | null;
  avgLatency: number | null;
  loss: number | null;
  uptime: number | null;
  downMbit: number | null;
  upMbit: number | null;
  clients: number | null;
  devices: NetDevice[];
  offline: NetDevice[];
  updates: NetDevice[];
  /** [unix-sekunder, ms] för svarstidsgrafen. */
  latencySeries: [number, number][];
};

/**
 * Synken körs var 5:e minut. Molnets mätvärden kommer i omgångar och kan släpa över en timme,
 * så gamla mätvärden betyder inte avbrott – bara att status är okänd om de är riktigt gamla.
 * Avbrott avgörs av routern (konsolen) offline, rapporterad nertid eller internetproblem.
 */
const SYNC_STALE_MIN = 20;
const METRIC_STALE_MIN = 180;
const SLOW_MS = 50;
const SLOW_LOSS = 2;

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function summarizeNet(status: NetStatusRow | null, isp: NetIsp[], devices: NetDevice[], now = Date.now()): Net | null {
  if (!status) return null;
  const rows = [...isp].sort((a, b) => a.ts.localeCompare(b.ts));
  const last = rows.at(-1);
  const nums = (k: keyof NetIsp) => rows.map((r) => r[k]).filter((v): v is number => typeof v === 'number');
  const offline = devices.filter((d) => d.status !== 'online');
  const consoleDown = devices.some((d) => d.is_console && d.status !== 'online');
  const syncStale = now - Date.parse(status.checked_at) > SYNC_STALE_MIN * 60_000;
  const metricStale = !last || now - Date.parse(last.ts) > METRIC_STALE_MIN * 60_000;
  const lastDown = !!last && ((last.downtime ?? 0) > 0 || (last.uptime ?? 100) < 100);
  const issues = (status.internet_issues ?? []).length > 0;

  const state: Net['state'] = syncStale ? 'unknown'
    : consoleDown || lastDown || issues ? 'down'
      : metricStale ? 'unknown'
      : (last?.latency_ms ?? 0) > SLOW_MS || (last?.packet_loss ?? 0) > SLOW_LOSS ? 'slow' : 'ok';

  const mbit = (k: number | null | undefined) => (k == null ? null : Math.round(k / 1000));
  return {
    state,
    isp: status.isp,
    latency: last?.latency_ms ?? null,
    avgLatency: avg(nums('latency_ms')),
    loss: avg(nums('packet_loss')),
    uptime: avg(nums('uptime')),
    downMbit: mbit(last?.download_kbps),
    upMbit: mbit(last?.upload_kbps),
    clients: status.wifi_clients == null && status.wired_clients == null ? null : (status.wifi_clients ?? 0) + (status.wired_clients ?? 0),
    devices,
    offline,
    updates: devices.filter((d) => d.firmware_status && d.firmware_status !== 'upToDate'),
    latencySeries: rows.filter((r) => r.latency_ms != null).map((r) => [Math.round(Date.parse(r.ts) / 1000), r.latency_ms!]),
  };
}

export const NET_LABEL: Record<Net['state'], string> = {
  ok: 'Internet ok',
  slow: 'Internet långsamt',
  down: 'Internet nere',
  unknown: 'Internet okänt',
};
