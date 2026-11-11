// Hämtar namnsdagar för i år och nästa år från Svenska dagar (sholiday.faboul.se) till tabellen name_days.
// Anropas av pg_cron med headern x-cron-secret.
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

type Day = { datum: string; namnsdag?: string[] };

Deno.serve(async (req) => {
  const { data: cron } = await db.rpc("get_secret", { secret_name: "cron_secret" });
  if (!cron || req.headers.get("x-cron-secret") !== cron) return json({ error: "unauthorized" }, 401);

  const year = new Date().getUTCFullYear();
  const result: Record<string, number | string> = {};
  for (const y of [year, year + 1]) {
    const res = await fetch(`https://sholiday.faboul.se/dagar/v2.1/${y}`);
    if (!res.ok) {
      result[y] = `fel ${res.status}`;
      continue;
    }
    const days: Day[] = (await res.json()).dagar ?? [];
    const rows = days.map((d) => ({ date: d.datum, names: d.namnsdag ?? [] }));
    const { error } = await db.from("name_days").upsert(rows, { onConflict: "date" });
    result[y] = error ? `fel: ${error.message}` : rows.length;
  }
  return json({ ok: true, ...result });
});
