// Internetstatus och nätverkshälsa från UniFi Site Manager (moln-API, kräver ingen lokal åtkomst).
// Anropas av pg_cron var 5:e minut med headern x-cron-secret. ?debug returnerar rådata.
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
const API = "https://api.ui.com";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function secret(name: string): Promise<string | null> {
  const { data, error } = await db.rpc("get_secret", { secret_name: name });
  if (error) throw new Error(`get_secret: ${error.message}`);
  return data as string | null;
}

async function ui(path: string, key: string) {
  const res = await fetch(API + path, { headers: { "X-API-KEY": key, accept: "application/json" } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${path}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

Deno.serve(async (req) => {
  const cron = await secret("cron_secret");
  if (!cron || req.headers.get("x-cron-secret") !== cron) return json({ error: "unauthorized" }, 401);
  const debug = new URL(req.url).searchParams.has("debug");

  try {
    const key = await secret("unifi_api_key");
    if (!key) throw new Error("unifi_api_key saknas i Vault");
    const [hosts, devices, sites, isp] = await Promise.all([
      ui("/v1/hosts", key),
      ui("/v1/devices", key),
      ui("/v1/sites", key),
      ui("/ea/isp-metrics/5m?duration=24h", key),
    ]);
    if (debug) {
      const cut = (x: unknown) => JSON.stringify(x).slice(0, 2500);
      return json({ hosts: cut(hosts), devices: cut(devices), sites: cut(sites), isp: cut(isp) });
    }

    // Internetmätningar (5-minutersperioder); behåll 30 dagar.
    type Wan = { avgLatency?: number; maxLatency?: number; packetLoss?: number; download_kbps?: number; upload_kbps?: number; uptime?: number; downtime?: number; ispName?: string };
    type Period = { metricTime: string; data?: { wan?: Wan } };
    const periods: Period[] = (isp.data ?? []).flatMap((x: { periods?: Period[] }) => x.periods ?? []);
    const ispRows = periods.filter((p) => p.data?.wan).map((p) => {
      const w = p.data!.wan!;
      return {
        ts: p.metricTime, latency_ms: w.avgLatency ?? null, max_latency_ms: w.maxLatency ?? null, packet_loss: w.packetLoss ?? null,
        download_kbps: w.download_kbps ?? null, upload_kbps: w.upload_kbps ?? null, uptime: w.uptime ?? null, downtime: w.downtime ?? null, isp: w.ispName ?? null,
      };
    });
    if (ispRows.length) {
      const { error } = await db.from("net_isp").upsert(ispRows, { onConflict: "ts" });
      if (error) throw new Error(`net_isp: ${error.message}`);
    }
    await db.from("net_isp").delete().lt("ts", new Date(Date.now() - 30 * 86400_000).toISOString());

    // UniFi-enheter (router, switch, accesspunkter).
    type Dev = { id: string; name?: string; model?: string; status?: string; version?: string; firmwareStatus?: string; isConsole?: boolean; startupTime?: string };
    const devs: Dev[] = (devices.data ?? []).flatMap((h: { devices?: Dev[] }) => h.devices ?? []);
    if (devs.length) {
      const { error } = await db.from("net_devices").upsert(devs.map((d) => ({
        id: d.id, name: d.name || d.model || d.id, model: d.model ?? null, status: d.status ?? null, version: d.version ?? null,
        firmware_status: d.firmwareStatus ?? null, is_console: !!d.isConsole, startup_time: d.startupTime ?? null, updated_at: new Date().toISOString(),
      })), { onConflict: "id" });
      if (error) throw new Error(`net_devices: ${error.message}`);
      await db.from("net_devices").delete().not("id", "in", `(${devs.map((d) => `"${d.id}"`).join(",")})`);
    }

    // Sammanfattning från nätverket (site).
    const site = (sites.data ?? [])[0]?.statistics ?? {};
    const c = site.counts ?? {};
    const { error } = await db.from("net_status").upsert({
      id: 1, isp: site.ispInfo?.name ?? ispRows.at(-1)?.isp ?? null,
      wifi_clients: c.wifiClient ?? null, wired_clients: c.wiredClient ?? null,
      offline_devices: c.offlineDevice ?? null, pending_updates: c.pendingUpdateDevice ?? null,
      internet_issues: site.internetIssues ?? [], checked_at: new Date().toISOString(),
    }, { onConflict: "id" });
    if (error) throw new Error(`net_status: ${error.message}`);

    return json({ ok: true, isp: ispRows.length, devices: devs.length, hosts: (hosts.data ?? []).length });
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 502);
  }
});
