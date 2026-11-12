// Philips Hue Remote API (moln) per hushåll: OAuth, scener, styrning och synk till dashboardens tabeller.
// Användaranrop (JWT): authorize {state} · exchange {code} · status · scenes · activate {id, dynamic?}
//                      light {id, on?, dim?, temp?, hue?, sat?} · room {zone, scene: ljust|mys|slack}
// Cron (x-cron-secret): sync – fyller zones/devices/capability_state/readings/moods för Hue-hushåll.
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
/** Varje hushåll har en egen Hue-app (callback-adressen skiljer sig). Fredrik: utan suffix. */
const creds = async (hh: string) => {
  const sfx = hh === "fredrik" ? "" : `_${hh}`;
  return { id: await secret(`hue_client_id${sfx}`), secret: await secret(`hue_client_secret${sfx}`) };
};

type Auth = { access_token: string; refresh_token: string; expires_at: string; app_key: string | null };

async function token(hh: string, body: Record<string, string>): Promise<Auth> {
  const c = await creds(hh);
  const res = await fetch(`${HUE}/v2/oauth2/token`, {
    method: "POST",
    headers: { authorization: `Basic ${btoa(`${c.id}:${c.secret}`)}`, "content-type": "application/x-www-form-urlencoded" },
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

/** Gällande inloggning för hushållet; förnyas automatiskt när åtkomstnyckeln gått ut. */
async function auth(hh: string): Promise<Auth | null> {
  const { data } = await db.from("hue_auth").select("access_token,refresh_token,expires_at,app_key").eq("household_id", hh).maybeSingle();
  if (!data) return null;
  if (Date.parse(data.expires_at) > Date.now()) return data as Auth;
  const fresh = { ...(await token(hh, { grant_type: "refresh_token", refresh_token: data.refresh_token })), app_key: data.app_key };
  await db.from("hue_auth").upsert({ household_id: hh, ...fresh, updated_at: new Date().toISOString() });
  return fresh;
}

// deno-lint-ignore no-explicit-any
type Res = Record<string, any>;
async function clip(a: Auth, path: string, init: RequestInit = {}): Promise<{ data: Res[] }> {
  const res = await fetch(`${HUE}/route/clip/v2${path}`, {
    ...init,
    headers: { authorization: `Bearer ${a.access_token}`, "hue-application-key": a.app_key ?? "", "content-type": "application/json" },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Hue ${res.status} ${path}: ${JSON.stringify(body).slice(0, 200)}`);
  return body;
}

// ---- Färger: CIE xy ↔ RGB/HSV ------------------------------------------------------------
function xyRgb(x: number, y: number): [number, number, number] {
  const z = 1 - x - y, Y = 1, X = (Y / y) * x, Z = (Y / y) * z;
  let r = X * 1.656492 - Y * 0.354851 - Z * 0.255038;
  let g = -X * 0.707196 + Y * 1.655397 + Z * 0.036152;
  let b = X * 0.051713 - Y * 0.121364 + Z * 1.01153;
  const m = Math.max(r, g, b, 1e-6);
  [r, g, b] = [r / m, g / m, b / m].map((c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055));
  return [r, g, b].map((c) => Math.min(1, Math.max(0, c))) as [number, number, number];
}
const xyHex = (x: number, y: number) => "#" + xyRgb(x, y).map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join("");
function rgbHsv([r, g, b]: [number, number, number]): [number, number] {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [((h * 60 + 360) % 360) / 360, max ? d / max : 0];
}
function hsXy(h: number, s: number): { x: number; y: number } {
  const f = (n: number) => { const k = (n + h * 6) % 6; return 1 - s * Math.max(0, Math.min(k, 4 - k, 1)); };
  const lin = (c: number) => (c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92);
  const [r, g, b] = [lin(f(5)), lin(f(3)), lin(f(1))];
  const X = r * 0.664511 + g * 0.154324 + b * 0.162028, Y = r * 0.283881 + g * 0.668433 + b * 0.047685, Z = r * 0.000088 + g * 0.07231 + b * 0.986039;
  const sum = X + Y + Z || 1;
  return { x: +(X / sum).toFixed(4), y: +(Y / sum).toFixed(4) };
}
/** light_temperature 0 (kallt) … 1 (varmt) ↔ mirek 153 … 500. */
const toMirek = (t: number) => Math.round(153 + Math.min(1, Math.max(0, t)) * 347);
const fromMirek = (m: number) => Math.min(1, Math.max(0, (m - 153) / 347));

// ---- Synk: Hue → samma format som HomeyScript skickar --------------------------------------
async function sync(hh: string) {
  const a = await auth(hh);
  if (!a) return { household: hh, skipped: "ej ansluten" };
  const [rooms, devices, lights, motion, temps, levels, contacts, power, scenes] = await Promise.all(
    ["room", "device", "light", "motion", "temperature", "light_level", "contact", "device_power", "scene"]
      .map((r) => clip(a, `/resource/${r}`).then((x) => x.data).catch(() => [] as Res[])),
  );
  const root = `${hh}-hem`;
  const zoneOf = new Map<string, string>(); // hue-enhet → rum
  for (const r of rooms) for (const c of r.children ?? []) if (c.rtype === "device") zoneOf.set(c.rid, r.id);
  const devName = new Map(devices.map((d) => [d.id, d.metadata?.name ?? "Enhet"]));

  // Senaste kända värden: behåll tidsstämpeln när värdet inte ändrats (historik bara vid ändring).
  const { data: prev } = await db.from("capability_state").select("device_id,capability_id,value_num,value_bool,last_updated").eq("household_id", hh);
  const old = new Map((prev ?? []).map((c) => [`${c.device_id}|${c.capability_id}`, c]));
  const now = new Date().toISOString();
  const cap = (dev: string, id: string, v: number | boolean | null, t?: string) => {
    if (v === null || v === undefined || (typeof v === "number" && !Number.isFinite(v))) return null;
    const o = old.get(`${dev}|${id}`);
    const same = o && (typeof v === "boolean" ? o.value_bool === v : Math.abs((o.value_num ?? NaN) - v) < 1e-6);
    return { id, v, t: t ?? (same ? o!.last_updated : now) };
  };

  const out: { id: string; name: string; zone: string; class: string; driver: string; available: boolean; caps: unknown[] }[] = [];
  for (const l of lights) {
    const xy = l.color?.xy;
    const hs = xy ? rgbHsv(xyRgb(xy.x, xy.y)) : null;
    const colorMode = !l.color_temperature?.mirek_valid;
    out.push({
      id: l.id, name: l.metadata?.name ?? devName.get(l.owner?.rid) ?? "Lampa", zone: zoneOf.get(l.owner?.rid) ?? root,
      class: "light", driver: "hue:light", available: true,
      caps: [
        cap(l.id, "onoff", !!l.on?.on),
        l.dimming ? cap(l.id, "dim", Math.round(l.dimming.brightness) / 100) : null,
        l.color_temperature?.mirek ? cap(l.id, "light_temperature", +fromMirek(l.color_temperature.mirek).toFixed(3)) : null,
        hs ? cap(l.id, "light_hue", +hs[0].toFixed(3)) : null,
        hs ? cap(l.id, "light_saturation", colorMode ? +hs[1].toFixed(3) : 0) : null,
      ].filter(Boolean),
    });
  }
  // Sensorer: en dashboard-enhet per Hue-enhet med rörelse/temperatur/ljus/kontakt/batteri.
  const sensors = new Map<string, unknown[]>();
  const add = (owner: string | undefined, c: unknown) => {
    if (!owner || !c) return;
    if (!sensors.has(owner)) sensors.set(owner, []);
    sensors.get(owner)!.push(c);
  };
  for (const m of motion) add(m.owner?.rid, cap(m.owner?.rid, "alarm_motion", !!(m.motion?.motion_report?.motion ?? m.motion?.motion), m.motion?.motion_report?.changed));
  for (const t of temps) {
    const v = t.temperature?.temperature_report?.temperature ?? t.temperature?.temperature;
    if (typeof v === "number") add(t.owner?.rid, cap(t.owner?.rid, "measure_temperature", +v.toFixed(2), t.temperature?.temperature_report?.changed));
  }
  for (const l of levels) {
    const v = l.light?.light_level_report?.light_level ?? l.light?.light_level;
    if (typeof v === "number") add(l.owner?.rid, cap(l.owner?.rid, "measure_luminance", Math.round(Math.pow(10, (v - 1) / 10000)), l.light?.light_level_report?.changed));
  }
  for (const c of contacts) add(c.owner?.rid, cap(c.owner?.rid, "alarm_contact", c.contact_report?.state !== "contact", c.contact_report?.changed));
  for (const p of power) if (typeof p.power_state?.battery_level === "number") add(p.owner?.rid, cap(p.owner?.rid, "measure_battery", p.power_state.battery_level));
  for (const [owner, caps] of sensors) {
    if (!caps.some((c) => (c as { id: string }).id !== "measure_battery")) continue; // bara riktiga sensorer
    out.push({ id: owner, name: devName.get(owner) ?? "Sensor", zone: zoneOf.get(owner) ?? root, class: "sensor", driver: "hue:sensor", available: true, caps });
  }

  const p = {
    household: hh,
    zones: [{ id: root, name: "Hem", parent: null }, ...rooms.map((r) => ({ id: r.id, name: r.metadata?.name ?? "Rum", parent: root }))],
    devices: out,
    moods: scenes.map((s) => ({ id: s.id, name: s.metadata?.name ?? "Scen", zone: s.group?.rtype === "room" ? s.group.rid : root, favorite: false })),
  };
  const t0 = Date.now();
  const { data, error } = await db.rpc("ingest_homey", { p });
  const moods = error ? null : await db.rpc("ingest_moods", { p });
  await db.from("ingest_log").insert({
    source: "hue-sync", ok: !error && !moods?.error, duration_ms: Date.now() - t0, household_id: hh,
    stats: { ...(data ?? {}), moods: moods?.data ?? null, lights: lights.length, sensors: sensors.size },
    error: error?.message ?? moods?.error?.message ?? null,
  });
  if (error) throw new Error(`ingest: ${error.message}`);
  return { household: hh, ...data, lights: lights.length };
}

// ---- Styrning ----------------------------------------------------------------------------
async function setLight(a: Auth, id: string, c: { on?: boolean; dim?: number; temp?: number; hue?: number; sat?: number }) {
  const body: Res = {};
  if (c.hue !== undefined) body.color = { xy: hsXy(c.hue, c.sat ?? 1) };
  else if (c.temp !== undefined) body.color_temperature = { mirek: toMirek(c.temp) };
  if (c.dim !== undefined) body.dimming = { brightness: Math.max(1, Math.round(c.dim * 100)) };
  body.on = { on: c.on ?? true };
  await clip(a, `/resource/light/${id}`, { method: "PUT", body: JSON.stringify(body) });
}

/** Ljust / Mys (solnedgång) / Släck för ett Hue-rum, samma idé som Homey-skriptet DB Scen. */
async function roomScene(a: Auth, zone: string, scene: string) {
  const [rooms, lights] = await Promise.all([clip(a, "/resource/room"), clip(a, "/resource/light")]);
  const room = rooms.data.find((r) => r.id === zone);
  if (!room) throw new Error("okänt rum");
  const owners = new Set((room.children ?? []).map((c: Res) => c.rid));
  const inRoom = lights.data.filter((l) => owners.has(l.owner?.rid));
  const sunset = [[0.07, 0.9, 0.35], [0.11, 0.65, 0.4], [0.03, 0.75, 0.3]];
  let n = 0;
  await Promise.all(inRoom.map((l) => {
    if (scene === "slack") return clip(a, `/resource/light/${l.id}`, { method: "PUT", body: JSON.stringify({ on: { on: false } }) });
    if (scene === "ljust") return setLight(a, l.id, { on: true, dim: 1, temp: 0.3 });
    if (l.color) { const [h, s, d] = sunset[n++ % sunset.length]; return setLight(a, l.id, { on: true, hue: h, sat: s, dim: d }); }
    return setLight(a, l.id, { on: true, dim: 0.35, temp: 1 });
  }));
}

Deno.serve(async (req) => {
  let p: Res;
  try { p = await req.json(); } catch { return json({ error: "invalid json" }, 400); }

  // Cron: synka alla Hue-hushåll som är anslutna.
  if (p.action === "sync") {
    const cron = await secret("cron_secret");
    if (req.headers.get("x-cron-secret") !== cron) return json({ error: "unauthorized" }, 401);
    const { data: hhs } = await db.from("households").select("id").eq("source", "hue");
    const results = [];
    for (const h of hhs ?? []) results.push(await sync(h.id).catch((e) => ({ household: h.id, error: String(e) })));
    return json({ ok: true, results });
  }

  // Användare: hushållet avgörs av inloggningen (app_users).
  const user = createClient(SB_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { authorization: req.headers.get("authorization") ?? "" } },
    auth: { persistSession: false },
  });
  const { data: hh } = await user.rpc("my_household");
  if (!hh) return json({ error: "unauthorized" }, 401);

  try {
    if (p.action === "authorize") {
      if (!p.state || !/^[\w-]{16,64}$/.test(p.state)) return json({ error: "ogiltig state" }, 400);
      const q = new URLSearchParams({ client_id: (await creds(hh)).id, response_type: "code", state: p.state });
      return json({ url: `${HUE}/v2/oauth2/authorize?${q}` });
    }

    if (p.action === "exchange") {
      if (!p.code) return json({ error: "code saknas" }, 400);
      const t = await token(hh, { grant_type: "authorization_code", code: p.code });
      // Koppla bryggan: "länkknappen" via molnet och en applikationsnyckel (API v1, enligt Hue).
      const h = { authorization: `Bearer ${t.access_token}`, "content-type": "application/json" };
      await fetch(`${HUE}/route/api/0/config`, { method: "PUT", headers: h, body: JSON.stringify({ linkbutton: true }) });
      const link = await (await fetch(`${HUE}/route/api`, { method: "POST", headers: h, body: JSON.stringify({ devicetype: "myhomey#dashboard" }) })).json();
      const key = link?.[0]?.success?.username;
      if (!key) throw new Error(`Kunde inte länka bryggan: ${JSON.stringify(link).slice(0, 200)}`);
      await db.from("hue_auth").upsert({ household_id: hh, ...t, app_key: key, updated_at: new Date().toISOString() });
      if (hh !== "fredrik") await sync(hh).catch(() => null); // fyll dashboarden direkt
      return json({ ok: true });
    }

    const a = await auth(hh);
    if (!a) return json({ connected: false, scenes: [] });
    if (p.action === "status") return json({ connected: true });

    if (p.action === "scenes") {
      const [scenes, rooms, zones] = await Promise.all([clip(a, "/resource/scene"), clip(a, "/resource/room"), clip(a, "/resource/zone")]);
      const names = new Map([...rooms.data, ...zones.data].map((g) => [g.id, g.metadata?.name ?? ""]));
      return json({
        connected: true,
        scenes: scenes.data.map((s) => {
          const xys = [...(s.palette?.color ?? []).map((c: Res) => c.color.xy), ...(s.actions ?? []).map((x: Res) => x.action?.color?.xy).filter(Boolean)];
          return {
            id: s.id, name: s.metadata?.name ?? "Scen", room: names.get(s.group?.rid ?? "") ?? null,
            colors: [...new Set(xys.slice(0, 6).map((xy: Res) => xyHex(xy.x, xy.y)))].slice(0, 3),
            dynamic: (s.palette?.color?.length ?? 0) > 1,
            active: !!s.status?.active && s.status.active !== "inactive",
          };
        }),
      });
    }

    const valid = (id: unknown) => typeof id === "string" && /^[\w-]{4,64}$/.test(id);
    if (p.action === "activate") {
      if (!valid(p.id)) return json({ error: "ogiltig scen" }, 400);
      await clip(a, `/resource/scene/${p.id}`, { method: "PUT", body: JSON.stringify({ recall: { action: p.dynamic ? "dynamic_palette" : "active" } }) });
    } else if (p.action === "light") {
      if (!valid(p.id)) return json({ error: "ogiltig lampa" }, 400);
      if (p.on === false && p.dim === undefined && p.temp === undefined && p.hue === undefined) {
        await clip(a, `/resource/light/${p.id}`, { method: "PUT", body: JSON.stringify({ on: { on: false } }) });
      } else await setLight(a, p.id, p);
    } else if (p.action === "room") {
      if (!valid(p.zone) || !["ljust", "mys", "slack"].includes(p.scene)) return json({ error: "ogiltigt rum eller scen" }, 400);
      await roomScene(a, p.zone, p.scene);
    } else {
      return json({ error: "okänd action" }, 400);
    }
    // Hue-hushåll: läs tillbaka läget direkt efter styrning så att dashboarden visar det nya.
    if (hh !== "fredrik") { await new Promise((r) => setTimeout(r, 800)); await sync(hh).catch(() => null); }
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});
