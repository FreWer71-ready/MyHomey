// Spotify Web API per hushåll: OAuth och styrning av uppspelning på högtalare (Spotify Connect). Kräver Premium.
// Användaranrop (JWT): authorize {state, redirect} · exchange {code, redirect} · status
//                      play {device?} · pause · next · previous · volume {pct} · transfer {device}
// Appens nycklar i Vault: spotify_client_id, spotify_client_secret (samma app för alla hushåll).
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const db = createClient(SB_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const API = "https://api.spotify.com/v1";
const SCOPES = "user-read-playback-state user-modify-playback-state user-read-currently-playing";
/** Återkomstadressen måste vara dashboardens egen (registrerad i Spotify-appen). */
const REDIRECT = /^https:\/\/trand\.se\/[\w-]+\/api\/spotify\/callback$/;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function secret(name: string): Promise<string | null> {
  const { data, error } = await db.rpc("get_secret", { secret_name: name });
  return error || !data ? null : (data as string);
}
async function creds() {
  const [id, sec] = await Promise.all([secret("spotify_client_id"), secret("spotify_client_secret")]);
  return id && sec ? { id, secret: sec } : null;
}

type Auth = { access_token: string; refresh_token: string; expires_at: string };

async function token(body: Record<string, string>, refresh?: string): Promise<Auth> {
  const c = await creds();
  if (!c) throw new Error("Spotify-appen saknas");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { authorization: `Basic ${btoa(`${c.id}:${c.secret}`)}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const t = await res.json().catch(() => ({}));
  if (!res.ok || !t.access_token) throw new Error(`Spotify token ${res.status}: ${t.error ?? ""}`);
  return {
    access_token: t.access_token,
    // Spotify skickar inte alltid en ny förnyelsenyckel; då gäller den gamla.
    refresh_token: t.refresh_token ?? refresh ?? "",
    expires_at: new Date(Date.now() + (Number(t.expires_in ?? 3600) - 120) * 1000).toISOString(),
  };
}

/** Gällande inloggning för hushållet; förnyas automatiskt när åtkomstnyckeln gått ut. */
async function auth(hh: string): Promise<Auth | null> {
  const { data } = await db.from("spotify_auth").select("access_token,refresh_token,expires_at").eq("household_id", hh).maybeSingle();
  if (!data) return null;
  if (Date.parse(data.expires_at) > Date.now()) return data as Auth;
  const fresh = await token({ grant_type: "refresh_token", refresh_token: data.refresh_token }, data.refresh_token);
  await db.from("spotify_auth").upsert({ household_id: hh, ...fresh, updated_at: new Date().toISOString() });
  return fresh;
}

// deno-lint-ignore no-explicit-any
type Res = Record<string, any>;
/** Anrop mot Web API. 204 = tomt svar (t.ex. inget spelas). Fel ger Spotifys orsak (t.ex. NO_ACTIVE_DEVICE). */
async function api(a: Auth, path: string, init: RequestInit = {}): Promise<Res | null> {
  const res = await fetch(`${API}${path}`, { ...init, headers: { authorization: `Bearer ${a.access_token}`, "content-type": "application/json" } });
  if (res.status === 204) return null;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error?.reason ?? body?.error?.message ?? `Spotify ${res.status}`);
  return body;
}

Deno.serve(async (req) => {
  const p = await req.json().catch(() => ({}));
  const user = createClient(SB_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { authorization: req.headers.get("authorization") ?? "" } },
    auth: { persistSession: false },
  });
  const { data: hh } = await user.rpc("my_household");
  if (!hh) return json({ error: "unauthorized" }, 401);

  try {
    if (p.action === "authorize") {
      const c = await creds();
      if (!c) return json({ configured: false }, 404);
      if (!p.state || !/^[\w-]{16,64}$/.test(p.state) || !REDIRECT.test(p.redirect ?? "")) return json({ error: "ogiltigt" }, 400);
      const q = new URLSearchParams({ client_id: c.id, response_type: "code", redirect_uri: p.redirect, state: p.state, scope: SCOPES });
      return json({ url: `https://accounts.spotify.com/authorize?${q}` });
    }
    if (p.action === "exchange") {
      if (!p.code || !REDIRECT.test(p.redirect ?? "")) return json({ error: "ogiltigt" }, 400);
      const t = await token({ grant_type: "authorization_code", code: p.code, redirect_uri: p.redirect });
      await db.from("spotify_auth").upsert({ household_id: hh, ...t, updated_at: new Date().toISOString() });
      return json({ ok: true });
    }

    if (!(await creds())) return json({ configured: false, connected: false });
    const a = await auth(hh);
    if (!a) return json({ configured: true, connected: false });

    if (p.action === "status") {
      const [player, devs] = await Promise.all([api(a, "/me/player?additional_types=episode"), api(a, "/me/player/devices")]);
      const item = player?.item;
      return json({
        configured: true, connected: true,
        playing: !!player?.is_playing,
        track: item ? {
          title: item.name,
          artist: (item.artists ?? []).map((x: Res) => x.name).join(", ") || item.show?.name || null,
          image: (item.album?.images ?? item.images ?? []).at(-1)?.url ?? null,
        } : null,
        device: player?.device ? { id: player.device.id, name: player.device.name, volume: player.device.volume_percent ?? null } : null,
        devices: (devs?.devices ?? []).filter((d: Res) => d.id && !d.is_restricted).map((d: Res) => ({
          id: d.id, name: d.name, type: d.type, active: !!d.is_active, volume: d.volume_percent ?? null, volumeOk: d.supports_volume !== false,
        })),
      });
    }

    const dev = (v: unknown) => typeof v === "string" && /^[\w-]{8,64}$/.test(v);
    if (p.action === "play") {
      if (p.device !== undefined && !dev(p.device)) return json({ error: "ogiltig högtalare" }, 400);
      await api(a, `/me/player/play${p.device ? `?device_id=${p.device}` : ""}`, { method: "PUT" });
    } else if (p.action === "pause") await api(a, "/me/player/pause", { method: "PUT" });
    else if (p.action === "next") await api(a, "/me/player/next", { method: "POST" });
    else if (p.action === "previous") await api(a, "/me/player/previous", { method: "POST" });
    else if (p.action === "volume") {
      const pct = Number(p.pct);
      if (!Number.isInteger(pct) || pct < 0 || pct > 100) return json({ error: "ogiltig volym" }, 400);
      await api(a, `/me/player/volume?volume_percent=${pct}`, { method: "PUT" });
    } else if (p.action === "transfer") {
      if (!dev(p.device)) return json({ error: "ogiltig högtalare" }, 400);
      await api(a, "/me/player", { method: "PUT", body: JSON.stringify({ device_ids: [p.device], play: true }) });
    } else return json({ error: "okänd action" }, 400);
    return json({ ok: true });
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    return json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});
