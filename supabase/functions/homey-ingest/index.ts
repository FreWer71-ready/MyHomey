// Tar emot ögonblicksbild från HomeyScript och skriver via ingest_homey().
// Auth: delad hemlighet i headern x-homey-secret, kontrolleras mot Vault (homey_ingest_secret).
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const s = req.headers.get("x-homey-secret") ?? "";
  if (!s) return json({ error: "unauthorized" }, 401);
  const { data: ok, error: authErr } = await db.rpc("verify_ingest_secret", { s });
  if (authErr) {
    console.error("verify failed", authErr.message);
    return json({ error: "auth check failed" }, 500);
  }
  if (ok !== true) return json({ error: "unauthorized" }, 401);

  let p: Record<string, unknown>;
  try {
    p = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const t0 = Date.now();
  const { data, error } = await db.rpc("ingest_homey", { p });
  const ms = Date.now() - t0;

  await db.from("ingest_log").insert({
    source: typeof p.source === "string" ? p.source : null,
    ok: !error,
    duration_ms: ms,
    stats: data ?? null,
    error: error?.message ?? null,
    payload: error ? p : null,
  });

  if (error) {
    console.error("ingest failed", error.message);
    return json({ error: "ingest failed" }, 500);
  }
  return json({ ok: true, ms, ...data });
});
