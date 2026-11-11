// Hämtar spotpriser för i dag och i morgon (SE3) från elprisetjustnu.se.
// Anropas av pg_cron varje timme med headern x-cron-secret. Morgondagens priser finns från ca 13.
import { createClient } from "npm:@supabase/supabase-js@2";

const AREA = "SE3";
const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const stockholmDate = (d: Date) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

type Price = { SEK_per_kWh: number; time_start: string; time_end: string };

Deno.serve(async (req) => {
  const { data: cron } = await db.rpc("get_secret", { secret_name: "cron_secret" });
  if (!cron || req.headers.get("x-cron-secret") !== cron) return json({ error: "unauthorized" }, 401);

  const result: Record<string, number | string> = {};
  for (const offset of [0, 1]) {
    const day = stockholmDate(new Date(Date.now() + offset * 86400_000));
    const [y, m, d] = day.split("-");
    const res = await fetch(`https://www.elprisetjustnu.se/api/v1/prices/${y}/${m}-${d}_${AREA}.json`);
    if (res.status === 404) {
      result[day] = "inte publicerat än";
      continue;
    }
    if (!res.ok) {
      result[day] = `fel ${res.status}`;
      continue;
    }
    const prices: Price[] = await res.json();
    const rows = prices.map((p) => ({ area: AREA, start_ts: p.time_start, end_ts: p.time_end, sek_per_kwh: p.SEK_per_kWh }));
    const { error } = await db.from("spot_prices").upsert(rows, { onConflict: "area,start_ts" });
    result[day] = error ? `fel: ${error.message}` : rows.length;
  }
  return json({ ok: true, area: AREA, ...result });
});
