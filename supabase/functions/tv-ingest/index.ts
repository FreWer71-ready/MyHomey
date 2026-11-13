// Tar emot TV-status från den lokala ADB-agenten (agents/tv-adb).
// Auth: x-tv-secret mot Vault (tv_secret). Agenten kan bara skriva tv_status, aldrig läsa något.
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const str = (v: unknown, max = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const STATUS = ["playing", "paused", "buffering", "stopped", "none"];

Deno.serve(async (req) => {
  const { data: secret } = await db.rpc("get_secret", { secret_name: "tv_secret" });
  if (!secret || req.headers.get("x-tv-secret") !== secret) return json({ error: "unauthorized" }, 401);
  let p: Record<string, unknown>;
  try { p = await req.json(); } catch { return json({ error: "invalid json" }, 400); }

  const household = str(p.household, 32) ?? "fredrik";
  const device = str(p.device_id, 64);
  if (!device || !/^[\w.:-]+$/.test(device)) return json({ error: "device_id krävs" }, 400);
  const { data: hh } = await db.from("households").select("id").eq("id", household).maybeSingle();
  if (!hh) return json({ error: "okänt hushåll" }, 400);

  const { error } = await db.from("tv_status").upsert({
    household_id: household,
    device_id: device,
    is_on: p.is_on === true,
    current_app: str(p.current_app, 120),
    app_name: str(p.app_name, 60),
    media_title: str(p.media_title),
    media_artist: str(p.media_artist),
    media_status: STATUS.includes(String(p.media_status)) ? String(p.media_status) : "none",
    updated_at: new Date().toISOString(),
  });
  return error ? json({ error: error.message }, 500) : json({ ok: true });
});
