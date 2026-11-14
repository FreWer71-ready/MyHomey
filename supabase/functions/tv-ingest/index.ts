// Tar emot TV-status från den lokala ADB-agenten (agents/tv-adb).
// Auth: x-tv-secret mot Vault, en hemlighet per hushåll (tv_secret för fredrik, tv_secret_<hushåll> för övriga).
// Hemligheten avgör hushållet, så en agent kan bara skriva sitt eget hushålls TV-status och aldrig läsa något.
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const str = (v: unknown, max = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const STATUS = ["playing", "paused", "buffering", "stopped", "none"];

Deno.serve(async (req) => {
  let p: Record<string, unknown>;
  try { p = await req.json(); } catch { return json({ error: "invalid json" }, 400); }

  const household = str(p.household, 32) ?? "fredrik";
  if (!/^[a-z0-9_]+$/.test(household)) return json({ error: "ogiltigt hushåll" }, 400);
  const { data: secret } = await db.rpc("get_secret", { secret_name: household === "fredrik" ? "tv_secret" : `tv_secret_${household}` });
  if (!secret || req.headers.get("x-tv-secret") !== secret) return json({ error: "unauthorized" }, 401);

  const device = str(p.device_id, 64);
  if (!device || !/^[\w.:-]+$/.test(device)) return json({ error: "device_id krävs" }, 400);

  const row = {
    household_id: household,
    device_id: device,
    is_on: p.is_on === true,
    current_app: str(p.current_app, 120),
    app_name: str(p.app_name, 60),
    media_title: str(p.media_title),
    media_artist: str(p.media_artist),
    media_status: STATUS.includes(String(p.media_status)) ? String(p.media_status) : "none",
    updated_at: new Date().toISOString(),
  };
  // changed_at flyttas bara när innehållet ändras, så att dashboarden kan visa det senaste först.
  const { data: prev } = await db.from("tv_status").select("is_on,current_app,media_title,media_status,changed_at")
    .eq("household_id", household).eq("device_id", device).maybeSingle();
  const same = prev && prev.is_on === row.is_on && prev.current_app === row.current_app && prev.media_title === row.media_title && prev.media_status === row.media_status;
  const { error } = await db.from("tv_status").upsert({ ...row, changed_at: same ? prev.changed_at : row.updated_at });
  return error ? json({ error: error.message }, 500) : json({ ok: true });
});
