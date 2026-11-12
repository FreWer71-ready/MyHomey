// Philips Hue Remote API (moln): OAuth, scener per rum och aktivering.
// Anropas av dashboarden med användarens JWT; bara godkända användare (is_allowed) släpps igenom.
// Actions: authorize {state} · exchange {code} · status · scenes · activate {id, dynamic?}
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const db = createClient(SB_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const HUE = "https://api.meethue.com";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function secret(name: string): Promise<string> {
  const { data, error } = await db.rpc("get_secret", { secret_name: name });
  if (error || !data) throw new Error(`${name} saknas`);
  return data as string;
}

type Auth = { access_token: string; refresh_token: string; expires_at: string; app_key: string | null };

async function token(body: Record<string, string>): Promise<Auth> {
  const basic = btoa(`${await secret("hue_client_id")}:${await secret("hue_client_secret")}`);
  const res = await fetch(`${HUE}/v2/oauth2/token`, {
    method: "POST",
    headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const t = await res.json().catch(() => ({}));
  if (!res.ok || !t.access_token) throw new Error(`Hue token ${res.status}: ${JSON.stringify(t).slice(0, 200)}`);
  return {
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expires_at: new Date(Date.now() + (Number(t.expires_in ?? 604800) - 300) * 1000).toISOString(),
    app_key: null,
  };
}

/** Gällande inloggning; förnyas automatiskt när åtkomstnyckeln gått ut. */
async function auth(): Promise<Auth | null> {
  const { data } = await db.from("hue_auth").select("access_token,refresh_token,expires_at,app_key").eq("id", 1).maybeSingle();
  if (!data) return null;
  if (Date.parse(data.expires_at) > Date.now()) return data as Auth;
  const fresh = await token({ grant_type: "refresh_token", refresh_token: data.refresh_token });
  const next = { ...fresh, app_key: data.app_key };
  await db.from("hue_auth").upsert({ id: 1, ...next, updated_at: new Date().toISOString() });
  return next;
}

async function clip(a: Auth, path: string, init: RequestInit = {}) {
  const res = await fetch(`${HUE}/route/clip/v2${path}`, {
    ...init,
    headers: { authorization: `Bearer ${a.access_token}`, "hue-application-key": a.app_key ?? "", "content-type": "application/json" },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Hue ${res.status} ${path}: ${JSON.stringify(body).slice(0, 200)}`);
  return body as { data: Record<string, unknown>[] };
}

/** CIE xy → ungefärlig hex-färg för knappens färgprov. */
function xyHex(x: number, y: number): string {
  const z = 1 - x - y, Y = 1, X = (Y / y) * x, Z = (Y / y) * z;
  let r = X * 1.656492 - Y * 0.354851 - Z * 0.255038;
  let g = -X * 0.707196 + Y * 1.655397 + Z * 0.036152;
  let b = X * 0.051713 - Y * 0.121364 + Z * 1.01153;
  const m = Math.max(r, g, b, 1e-6);
  [r, g, b] = [r / m, g / m, b / m].map((c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055));
  return "#" + [r, g, b].map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  // Bara inloggade och godkända användare.
  const user = createClient(SB_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { authorization: req.headers.get("authorization") ?? "" } },
    auth: { persistSession: false },
  });
  const { data: allowed } = await user.rpc("is_allowed");
  if (allowed !== true) return json({ error: "unauthorized" }, 401);

  let p: { action?: string; code?: string; id?: string; dynamic?: boolean; state?: string };
  try { p = await req.json(); } catch { return json({ error: "invalid json" }, 400); }

  try {
    if (p.action === "authorize") {
      if (!p.state || !/^[\w-]{16,64}$/.test(p.state)) return json({ error: "ogiltig state" }, 400);
      const q = new URLSearchParams({ client_id: await secret("hue_client_id"), response_type: "code", state: p.state });
      return json({ url: `${HUE}/v2/oauth2/authorize?${q}` });
    }

    if (p.action === "exchange") {
      if (!p.code) return json({ error: "code saknas" }, 400);
      const t = await token({ grant_type: "authorization_code", code: p.code });
      // Koppla bryggan: tryck "länkknappen" via molnet och hämta en applikationsnyckel.
      const h = { authorization: `Bearer ${t.access_token}`, "content-type": "application/json" };
      await fetch(`${HUE}/route/api/0/config`, { method: "PUT", headers: h, body: JSON.stringify({ linkbutton: true }) });
      const link = await (await fetch(`${HUE}/route/api`, { method: "POST", headers: h, body: JSON.stringify({ devicetype: "myhomey#dashboard" }) })).json();
      const key = link?.[0]?.success?.username;
      if (!key) throw new Error(`Kunde inte länka bryggan: ${JSON.stringify(link).slice(0, 200)}`);
      await db.from("hue_auth").upsert({ id: 1, ...t, app_key: key, updated_at: new Date().toISOString() });
      return json({ ok: true });
    }

    const a = await auth();
    if (!a) return json({ connected: false, scenes: [] });

    if (p.action === "status") return json({ connected: true });

    if (p.action === "scenes") {
      const [scenes, rooms, zones] = await Promise.all([clip(a, "/resource/scene"), clip(a, "/resource/room"), clip(a, "/resource/zone")]);
      type Named = { id: string; metadata?: { name?: string } };
      const names = new Map([...rooms.data, ...zones.data].map((g) => [(g as Named).id, (g as Named).metadata?.name ?? ""]));
      const out = scenes.data.map((s) => {
        const sc = s as {
          id: string; metadata?: { name?: string }; group?: { rid: string };
          palette?: { color?: { color: { xy: { x: number; y: number } } }[] };
          actions?: { action?: { color?: { xy: { x: number; y: number } } } }[];
          status?: { active?: string };
        };
        const xys = [...(sc.palette?.color ?? []).map((c) => c.color.xy), ...(sc.actions ?? []).map((x) => x.action?.color?.xy).filter(Boolean)] as { x: number; y: number }[];
        return {
          id: sc.id,
          name: sc.metadata?.name ?? "Scen",
          room: names.get(sc.group?.rid ?? "") ?? null,
          colors: [...new Set(xys.slice(0, 6).map((xy) => xyHex(xy.x, xy.y)))].slice(0, 3),
          dynamic: (sc.palette?.color?.length ?? 0) > 1,
          active: sc.status?.active && sc.status.active !== "inactive",
        };
      });
      return json({ connected: true, scenes: out });
    }

    if (p.action === "activate") {
      if (!p.id || !/^[\w-]{8,64}$/.test(p.id)) return json({ error: "ogiltig scen" }, 400);
      await clip(a, `/resource/scene/${p.id}`, { method: "PUT", body: JSON.stringify({ recall: { action: p.dynamic ? "dynamic_palette" : "active" } }) });
      return json({ ok: true });
    }

    return json({ error: "okänd action" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});
