// Tar emot vinkällarens sammanfattning från Trandvine (trigger på bottles, via pg_net).
// Auth: x-wine-secret mot Vault (wine_secret). E-posten avgör hushållet (app_users).
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

Deno.serve(async (req) => {
  const { data: secret } = await db.rpc("get_secret", { secret_name: "wine_secret" });
  if (!secret || req.headers.get("x-wine-secret") !== secret) return json({ error: "unauthorized" }, 401);
  let p: { email?: string; total?: number; by_color?: Record<string, number>; latest?: unknown; value?: number; ready?: number; past?: number };
  try { p = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
  if (!p.email || typeof p.total !== "number") return json({ error: "email och total krävs" }, 400);

  const { data: user } = await db.from("app_users").select("household_id").eq("email", p.email.toLowerCase()).maybeSingle();
  if (!user) return json({ ok: true, ignored: "okänd användare" });
  // Historik: ny punkt bara när antalet ändrats.
  const { data: prev } = await db.from("wine_cellar").select("total").eq("household_id", user.household_id).maybeSingle();
  if (!prev || prev.total !== p.total) {
    await db.from("wine_history").insert({ household_id: user.household_id, ts: new Date().toISOString(), total: p.total, by_color: p.by_color ?? null });
  }
  const { error } = await db.from("wine_cellar").upsert({
    household_id: user.household_id, total: p.total, by_color: p.by_color ?? {}, latest: p.latest ?? null,
    value: p.value ?? null, ready: p.ready ?? null, past: p.past ?? null, updated_at: new Date().toISOString(),
  });
  return error ? json({ error: error.message }, 500) : json({ ok: true });
});
