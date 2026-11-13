// Pendling via Trafikverkets öppna API: tåg Eskilstuna C <-> Stockholm C, händelser på bilvägen (väg 56 + E18 till Västerås)
// och vägväderstationen Eskilstuna Ö.
// Anropas av webben med användarens JWT (eller x-cron-secret vid test). Nyckeln ligger i Vault (trafikverket_api_key).
// Svarar med Trafikverkets rådata i nedbantad form; tolkningen görs i webben (lib/commute.ts).
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
const API = "https://api.trafikinfo.trafikverket.se/v2/data.json";
const A = "Et", B = "Cst", ROADS = "56,18", COUNTIES = "4,19";
// Väderstation (VViS) för Ute-kortet när hushållet saknar egen station i Homey: 429 = Eskilstuna Ö.
const STATION = "429";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let key: string | null = null;
let cache: { at: number; body: unknown } | null = null;

async function query(xml: string) {
  if (!key) key = (await db.rpc("get_secret", { secret_name: "trafikverket_api_key" })).data as string;
  const res = await fetch(API, {
    method: "POST",
    headers: { "content-type": "text/xml" },
    body: `<REQUEST><LOGIN authenticationkey="${key}"/>${xml}</REQUEST>`,
  });
  const out = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(out).slice(0, 300));
  return out.RESPONSE.RESULT as Record<string, unknown[]>[];
}

const TRAIN_FIELDS = ["AdvertisedTrainIdent", "AdvertisedTimeAtLocation", "EstimatedTimeAtLocation", "TimeAtLocation",
  "Canceled", "Deviation", "ToLocation", "TrackAtLocation", "LocationSignature", "ProductInformation"]
  .map((f) => `<INCLUDE>${f}</INCLUDE>`).join("");

const departures = (from: string, to: string) => `
<QUERY objecttype="TrainAnnouncement" schemaversion="1.9" limit="12" orderby="AdvertisedTimeAtLocation">
  <FILTER><AND>
    <EQ name="ActivityType" value="Avgang"/><EQ name="LocationSignature" value="${from}"/><EQ name="Advertised" value="true"/>
    <GT name="AdvertisedTimeAtLocation" value="$dateadd(-00:20:00)"/><LT name="AdvertisedTimeAtLocation" value="$dateadd(18:00:00)"/>
    <OR><EQ name="ToLocation.LocationName" value="${to}"/><EQ name="ViaToLocation.LocationName" value="${to}"/></OR>
  </AND></FILTER>${TRAIN_FIELDS}
</QUERY>`;

async function allowed(req: Request) {
  const cron = req.headers.get("x-cron-secret");
  if (cron) return cron === (await db.rpc("get_secret", { secret_name: "cron_secret" })).data;
  const jwt = req.headers.get("authorization")?.replace(/^Bearer /i, "");
  return !!jwt && !!(await db.auth.getUser(jwt)).data.user;
}

Deno.serve(async (req) => {
  try {
    if (!(await allowed(req))) return json({ error: "unauthorized" }, 401);
    // Felsökning (bara med x-cron-secret): skicka en egen QUERY rakt till Trafikverket.
    const p = await req.json().catch(() => ({}));
    if (p.query && req.headers.get("x-cron-secret")) return json(await query(p.query));
    if (cache && Date.now() - cache.at < 60_000) return json(cache.body);
    const [out, home, road, ws] = await query(departures(A, B) + departures(B, A) + `
<QUERY objecttype="Situation" namespace="road.trafficinfo" schemaversion="1.6" limit="80">
  <FILTER><AND><IN name="Deviation.RoadNumberNumeric" value="${ROADS}"/><IN name="Deviation.CountyNo" value="${COUNTIES}"/></AND></FILTER>
  <INCLUDE>Deviation</INCLUDE>
</QUERY>
<QUERY objecttype="WeatherMeasurepoint" namespace="Road.WeatherInfo" schemaversion="2.1" limit="1">
  <FILTER><EQ name="Id" value="${STATION}"/></FILTER>
  <INCLUDE>Name</INCLUDE><INCLUDE>Observation.Sample</INCLUDE><INCLUDE>Observation.Air.Temperature.Value</INCLUDE>
  <INCLUDE>Observation.Surface.Temperature.Value</INCLUDE><INCLUDE>Observation.Wind</INCLUDE>
  <INCLUDE>Observation.Aggregated10minutes.Wind.SpeedMax.Value</INCLUDE>
</QUERY>`);
    const outT = (out.TrainAnnouncement ?? []) as { AdvertisedTrainIdent: string }[];
    const homeT = (home.TrainAnnouncement ?? []) as { AdvertisedTrainIdent: string }[];
    // Ankomsttider vid andra änden för samma tåg.
    const idents = [...new Set([...outT, ...homeT].map((t) => t.AdvertisedTrainIdent))].join(",");
    const [arr] = idents
      ? await query(`
<QUERY objecttype="TrainAnnouncement" schemaversion="1.9" limit="60">
  <FILTER><AND>
    <EQ name="ActivityType" value="Ankomst"/><IN name="LocationSignature" value="${A},${B}"/><IN name="AdvertisedTrainIdent" value="${idents}"/>
    <GT name="AdvertisedTimeAtLocation" value="$dateadd(-00:20:00)"/><LT name="AdvertisedTimeAtLocation" value="$dateadd(20:00:00)"/>
  </AND></FILTER>
  <INCLUDE>AdvertisedTrainIdent</INCLUDE><INCLUDE>LocationSignature</INCLUDE><INCLUDE>AdvertisedTimeAtLocation</INCLUDE><INCLUDE>EstimatedTimeAtLocation</INCLUDE>
</QUERY>`)
      : [{}];
    const body = {
      from: A, to: B, roads: ROADS,
      out: outT, home: homeT,
      arrivals: arr.TrainAnnouncement ?? [],
      situations: road.Situation ?? [],
      station: ws?.WeatherMeasurepoint?.[0] ?? null,
      fetched: new Date().toISOString(),
    };
    cache = { at: Date.now(), body };
    return json(body);
  } catch (e) {
    return json({ error: String(e) }, 502);
  }
});
