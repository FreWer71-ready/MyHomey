// Hämtar anslutna klienter från UniFi (Site Manager connector) och sparar via ingest_unifi().
// Anropas av pg_cron med headern x-cron-secret. ?debug ger konsol, nätverk och klientnamn.
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

type UiClient = { macAddress?: string; mac?: string; name?: string; hostname?: string; ipAddress?: string; type?: string };

Deno.serve(async (req) => {
  const cron = await secret("cron_secret");
  if (!cron || req.headers.get("x-cron-secret") !== cron) return json({ error: "unauthorized" }, 401);
  const debug = new URL(req.url).searchParams.has("debug");

  try {
    const key = await secret("unifi_api_key");
    if (!key) throw new Error("unifi_api_key saknas i Vault");

    type Host = { id: string; type?: string; owner?: boolean; reportedState?: { hostname?: string; name?: string } };
    const hosts: Host[] = (await ui("/v1/hosts", key)).data ?? [];
    if (debug && new URL(req.url).searchParams.has("hosts")) {
      return json({ hosts: hosts.map((h) => ({ id: h.id, type: h.type, owner: h.owner, name: h.reportedState?.hostname ?? h.reportedState?.name })) });
    }
    // Connector kräver att nyckelns konto äger konsolen.
    const host = hosts.find((h) => h.type === "console" && h.owner !== false) ?? hosts.find((h) => h.owner !== false);
    if (!host) throw new Error(`Ingen ägd UniFi-konsol hittades (${hosts.length} delade)`);

    const base = `/v1/connector/consoles/${host.id}/proxy/network/integration/v1`;
    const site = ((await ui(`${base}/sites`, key)).data ?? [])[0];
    if (!site) throw new Error("Inget nätverk (site) hittades på konsolen");

    const clients: UiClient[] = [];
    for (let offset = 0; offset < 2000; offset += 200) {
      const page = (await ui(`${base}/sites/${site.id}/clients?limit=200&offset=${offset}`, key)).data ?? [];
      clients.push(...page);
      if (page.length < 200) break;
    }

    const rows = clients.map((c) => ({
      mac: c.macAddress ?? c.mac ?? null,
      name: c.name ?? c.hostname ?? null,
      ip: c.ipAddress ?? null,
      type: c.type ?? null,
    }));
    const { data, error } = await db.rpc("ingest_unifi", { clients: rows });
    if (error) throw new Error(`ingest_unifi: ${error.message}`);

    return json({
      ok: true,
      ...data,
      ...(debug && {
        console: host.reportedState?.hostname ?? host.reportedState?.name ?? host.id,
        clients: rows.map((r) => `${r.name ?? "(namnlös)"} [${r.type ?? "?"}]`).sort(),
      }),
    });
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 502);
  }
});
