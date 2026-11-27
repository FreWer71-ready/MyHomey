// Pendling via Trafikverkets (plus alla avgångar från Eskilstuna C) öppna API (avgångar 24 h framåt, så att måndagens morgontåg syns redan söndag eftermiddag): tåg Eskilstuna C <-> Stockholm C, händelser på bilvägen (väg 56 + E18 till Västerås)
// och vägväderstationen Eskilstuna Ö.
// Med { train: "950" }: tågets alla passager (även driftplatser mellan stationerna) och stationsnamn.
// Med { area: [minLon, minLat, maxLon, maxLat] }: vägärenden inom rutan (helgtrafik och resor från kalendern).
// Med { near: [lon, lat] }: tåg (GPS) nära en position, för tågläget.
// Pendlingens avgångar tas med från 2 h bakåt (avgångna sorteras bort i webben; behövs för "troligen på tåget").
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
// Vägväderstationer längs pendlingen: Eskilstuna Ö, Gröndal, Mellansundet (Kvicksund), Vallbymotet (E18 Västerås).
const ROUTE_STATIONS = "429,418,1903,1924";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let key: string | null = null;
let cache: { at: number; body: unknown } | null = null;
const areas = new Map<string, { at: number; body: unknown }>();
const trains = new Map<string, { at: number; body: unknown }>();
const stationNames = new Map<string, string>();

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
<QUERY objecttype="TrainAnnouncement" schemaversion="1.9" limit="70" orderby="AdvertisedTimeAtLocation">
  <FILTER><AND>
    <EQ name="ActivityType" value="Avgang"/><EQ name="LocationSignature" value="${from}"/><EQ name="Advertised" value="true"/>
    <GT name="AdvertisedTimeAtLocation" value="$dateadd(-02:00:00)"/><LT name="AdvertisedTimeAtLocation" value="$dateadd(1.00:00:00)"/>
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
    // Tågläge: { near: [lon, lat] } → aktiva tåg (GPS, TrainPosition) inom 800 m, rapporterade senaste 3 min. Cache 20 s.
    if (Array.isArray(p.near)) {
      const [lon, lat] = p.near.map(Number);
      if (!(lon > 10 && lon < 25 && lat > 55 && lat < 70)) return json({ error: "ogiltig position" }, 400);
      const k = `n:${lon.toFixed(3)}:${lat.toFixed(3)}`;
      const hit = areas.get(k);
      if (hit && Date.now() - hit.at < 20_000) return json(hit.body);
      const [r] = await query(`
<QUERY objecttype="TrainPosition" namespace="järnväg.trafikinfo" schemaversion="1.1" limit="10">
  <FILTER><AND>
    <WITHIN name="Position.WGS84" shape="center" value="${lon} ${lat}" radius="800m"/>
    <EQ name="Status.Active" value="true"/><GT name="TimeStamp" value="$dateadd(-0.00:03:00)"/>
  </AND></FILTER>
  <INCLUDE>Train.AdvertisedTrainNumber</INCLUDE><INCLUDE>Position.WGS84</INCLUDE><INCLUDE>TimeStamp</INCLUDE>
  <INCLUDE>Speed</INCLUDE><INCLUDE>Bearing</INCLUDE>
</QUERY>`);
      const body = { trains: r?.TrainPosition ?? [] };
      areas.set(k, { at: Date.now(), body });
      return json(body);
    }
    // Historik för en vägväderstation: { history: "429", hours: 24, bucket: 600 } → medel per period (sekunder).
    // Trafikverket sparar 5-minutersvärden bakåt i tiden; nederbörd summeras (mm), byar = högsta.
    if (p.history) {
      const id = String(p.history), hours = Math.min(Math.max(Number(p.hours) || 24, 1), 24 * 30);
      const bucket = Math.max(Number(p.bucket) || 600, 300);
      if (!ROUTE_STATIONS.split(",").includes(id)) return json({ error: "okänd station" }, 400);
      const k = `h:${id}:${hours}:${bucket}`;
      const hit = areas.get(k);
      if (hit && Date.now() - hit.at < 300_000) return json(hit.body);
      const d = Math.floor(hours / 24), h = hours % 24;
      const [r] = await query(`
<QUERY objecttype="WeatherObservation" namespace="Road.WeatherInfo" schemaversion="2.1" limit="10000" orderby="Sample">
  <FILTER><AND><EQ name="Measurepoint.Id" value="${id}"/><GT name="Sample" value="$dateadd(-${d}.${String(h).padStart(2, "0")}:00:00)"/></AND></FILTER>
  <INCLUDE>Sample</INCLUDE><INCLUDE>Air.Temperature.Value</INCLUDE><INCLUDE>Air.Dewpoint.Value</INCLUDE><INCLUDE>Air.RelativeHumidity.Value</INCLUDE>
  <INCLUDE>Surface.Temperature.Value</INCLUDE><INCLUDE>Wind</INCLUDE><INCLUDE>Aggregated10minutes.Wind.SpeedMax.Value</INCLUDE>
  <INCLUDE>Aggregated5minutes.Precipitation.TotalWaterEquivalent.Value</INCLUDE>
</QUERY>`);
      type O = { Sample: string; Air?: { Temperature?: { Value?: number }; Dewpoint?: { Value?: number }; RelativeHumidity?: { Value?: number } };
        Surface?: { Temperature?: { Value?: number } }; Wind?: { Speed?: { Value?: number } }[];
        Aggregated10minutes?: { Wind?: { SpeedMax?: { Value?: number } } };
        Aggregated5minutes?: { Precipitation?: { TotalWaterEquivalent?: { Value?: number } } } };
      const acc = new Map<number, { n: Record<string, number[]>; rain: number; gust: number | null }>();
      for (const o of (r.WeatherObservation ?? []) as O[]) {
        const t = Math.floor(Date.parse(o.Sample) / 1000 / bucket) * bucket;
        const a = acc.get(t) ?? { n: { air: [], road: [], dew: [], rh: [], wind: [] }, rain: 0, gust: null };
        const push = (key: string, v: number | undefined) => { if (typeof v === "number") a.n[key].push(v); };
        push("air", o.Air?.Temperature?.Value); push("road", o.Surface?.Temperature?.Value); push("dew", o.Air?.Dewpoint?.Value);
        push("rh", o.Air?.RelativeHumidity?.Value); push("wind", o.Wind?.[0]?.Speed?.Value);
        const g = o.Aggregated10minutes?.Wind?.SpeedMax?.Value;
        if (typeof g === "number") a.gust = Math.max(a.gust ?? 0, g);
        a.rain += o.Aggregated5minutes?.Precipitation?.TotalWaterEquivalent?.Value ?? 0;
        acc.set(t, a);
      }
      const mean = (v: number[]) => (v.length ? Math.round((v.reduce((x, y) => x + y, 0) / v.length) * 10) / 10 : null);
      const rows = [...acc.entries()].sort((x, y) => x[0] - y[0]).map(([t, a]) =>
        [t, mean(a.n.air), mean(a.n.road), mean(a.n.dew), mean(a.n.rh), mean(a.n.wind), a.gust, Math.round(a.rain * 10) / 10]);
      const body = { station: id, cols: ["t", "air", "road", "dew", "rh", "wind", "gust", "rain"], rows };
      if (areas.size > 50) areas.clear();
      areas.set(k, { at: Date.now(), body });
      return json(body);
    }
    // Område (helgtrafik/kalenderresa): vägärenden inom en ruta [minLon, minLat, maxLon, maxLat], cache 5 min per ruta.
    if (Array.isArray(p.area)) {
      const box = p.area.map(Number);
      if (box.length !== 4 || box.some((x: number) => !Number.isFinite(x)) || box[0] >= box[2] || box[1] >= box[3]
        || box[2] - box[0] > 4 || box[3] - box[1] > 3) return json({ error: "ogiltigt område" }, 400);
      const k = box.map((x: number) => x.toFixed(2)).join(",");
      const hit = areas.get(k);
      if (hit && Date.now() - hit.at < 300_000) return json(hit.body);
      const [r] = await query(`
<QUERY objecttype="Situation" namespace="road.trafficinfo" schemaversion="1.6" limit="200">
  <FILTER><WITHIN name="Deviation.Geometry.Point.WGS84" shape="box" value="${box[0]} ${box[1]}, ${box[2]} ${box[3]}"/></FILTER>
  <INCLUDE>Deviation</INCLUDE>
</QUERY>`);
      const body = { situations: r.Situation ?? [], fetched: new Date().toISOString() };
      if (areas.size > 50) areas.clear();
      areas.set(k, { at: Date.now(), body });
      return json(body);
    }
    // Ett tåg: alla passager idag (även driftplatser mellan stationerna, Advertised=false) + stationsnamn. Cache 45 s.
    if (typeof p.train === "string") {
      if (!/^\d{1,6}$/.test(p.train)) return json({ error: "ogiltigt tåg" }, 400);
      // `at` (ISO, valfritt): sök runt den tiden i stället för nu, så att äldre resor kan stämmas av i efterhand.
      const at = typeof p.at === "string" && !isNaN(Date.parse(p.at)) ? new Date(Date.parse(p.at)) : null;
      const ck = at ? `${p.train}@${at.toISOString()}` : p.train;
      const win = (h: number) => at ? new Date(at.getTime() + h * 3600_000).toISOString() : `$dateadd(${h < 0 ? "-" : ""}0${Math.abs(h)}:00:00)`;
      const hit = trains.get(ck);
      if (hit && Date.now() - hit.at < 45_000) return json(hit.body);
      const [r] = await query(`
<QUERY objecttype="TrainAnnouncement" schemaversion="1.9" limit="300" orderby="AdvertisedTimeAtLocation">
  <FILTER><AND><EQ name="AdvertisedTrainIdent" value="${p.train}"/>
    <GT name="AdvertisedTimeAtLocation" value="${win(-8)}"/><LT name="AdvertisedTimeAtLocation" value="${win(8)}"/></AND></FILTER>
  <INCLUDE>LocationSignature</INCLUDE><INCLUDE>ActivityType</INCLUDE><INCLUDE>Advertised</INCLUDE><INCLUDE>Canceled</INCLUDE>
  <INCLUDE>AdvertisedTimeAtLocation</INCLUDE><INCLUDE>EstimatedTimeAtLocation</INCLUDE><INCLUDE>TimeAtLocation</INCLUDE><INCLUDE>TrackAtLocation</INCLUDE>
  <INCLUDE>ScheduledDepartureDateTime</INCLUDE>
</QUERY>`);
      const anns = (r.TrainAnnouncement ?? []) as { LocationSignature: string }[];
      const sigs = [...new Set(anns.map((x) => x.LocationSignature))];
      const missing = sigs.filter((sig) => !stationNames.has(sig));
      if (missing.length) {
        const [st] = await query(`
<QUERY objecttype="TrainStation" namespace="rail.infrastructure" schemaversion="1.5" limit="500">
  <FILTER><IN name="LocationSignature" value="${missing.join(",")}"/></FILTER>
  <INCLUDE>LocationSignature</INCLUDE><INCLUDE>AdvertisedShortLocationName</INCLUDE><INCLUDE>AdvertisedLocationName</INCLUDE>
</QUERY>`);
        for (const x of (st.TrainStation ?? []) as { LocationSignature: string; AdvertisedShortLocationName?: string; AdvertisedLocationName?: string }[]) {
          stationNames.set(x.LocationSignature, x.AdvertisedShortLocationName ?? x.AdvertisedLocationName ?? x.LocationSignature);
        }
      }
      const body = { announcements: anns, names: Object.fromEntries(sigs.map((sig) => [sig, stationNames.get(sig) ?? sig])), fetched: new Date().toISOString() };
      if (trains.size > 100) trains.clear();
      trains.set(ck, { at: Date.now(), body });
      return json(body);
    }
    if (cache && Date.now() - cache.at < 60_000) return json(cache.body);
    const [out, home, road, ws, every, route] = await query(departures(A, B) + departures(B, A) + `
<QUERY objecttype="Situation" namespace="road.trafficinfo" schemaversion="1.6" limit="80">
  <FILTER><AND><IN name="Deviation.RoadNumberNumeric" value="${ROADS}"/><IN name="Deviation.CountyNo" value="${COUNTIES}"/></AND></FILTER>
  <INCLUDE>Deviation</INCLUDE>
</QUERY>
<QUERY objecttype="WeatherMeasurepoint" namespace="Road.WeatherInfo" schemaversion="2.1" limit="1">
  <FILTER><EQ name="Id" value="${STATION}"/></FILTER>
  <INCLUDE>Name</INCLUDE><INCLUDE>Observation.Sample</INCLUDE><INCLUDE>Observation.Air.Temperature.Value</INCLUDE>
  <INCLUDE>Observation.Surface.Temperature.Value</INCLUDE><INCLUDE>Observation.Wind</INCLUDE>
  <INCLUDE>Observation.Aggregated10minutes.Wind.SpeedMax.Value</INCLUDE>
</QUERY>
<QUERY objecttype="TrainAnnouncement" schemaversion="1.9" limit="60" orderby="AdvertisedTimeAtLocation">
  <FILTER><AND>
    <EQ name="ActivityType" value="Avgang"/><EQ name="LocationSignature" value="${A}"/><EQ name="Advertised" value="true"/>
    <GT name="AdvertisedTimeAtLocation" value="$dateadd(-00:20:00)"/><LT name="AdvertisedTimeAtLocation" value="$dateadd(06:00:00)"/>
  </AND></FILTER>${TRAIN_FIELDS}
</QUERY>
<QUERY objecttype="WeatherMeasurepoint" namespace="Road.WeatherInfo" schemaversion="2.1" limit="10">
  <FILTER><IN name="Id" value="${ROUTE_STATIONS}"/></FILTER>
  <INCLUDE>Id</INCLUDE><INCLUDE>Name</INCLUDE><INCLUDE>Observation.Sample</INCLUDE><INCLUDE>Observation.Air</INCLUDE>
  <INCLUDE>Observation.Surface.Temperature.Value</INCLUDE><INCLUDE>Observation.Wind</INCLUDE><INCLUDE>Observation.Weather</INCLUDE>
  <INCLUDE>Observation.Aggregated10minutes.Wind.SpeedMax.Value</INCLUDE><INCLUDE>Observation.Aggregated30minutes.Precipitation.Rain</INCLUDE>
  <INCLUDE>Observation.Aggregated30minutes.Precipitation.Snow</INCLUDE>
</QUERY>`);
    const outT = (out.TrainAnnouncement ?? []) as { AdvertisedTrainIdent: string }[];
    const homeT = (home.TrainAnnouncement ?? []) as { AdvertisedTrainIdent: string }[];
    // Ankomsttider vid andra änden för samma tåg.
    const idents = [...new Set([...outT, ...homeT].map((t) => t.AdvertisedTrainIdent))].join(",");
    const [arr] = idents
      ? await query(`
<QUERY objecttype="TrainAnnouncement" schemaversion="1.9" limit="200">
  <FILTER><AND>
    <EQ name="ActivityType" value="Ankomst"/><IN name="LocationSignature" value="${A},${B}"/><IN name="AdvertisedTrainIdent" value="${idents}"/>
    <GT name="AdvertisedTimeAtLocation" value="$dateadd(-02:00:00)"/><LT name="AdvertisedTimeAtLocation" value="$dateadd(1.02:00:00)"/>
  </AND></FILTER>
  <INCLUDE>AdvertisedTrainIdent</INCLUDE><INCLUDE>LocationSignature</INCLUDE><INCLUDE>AdvertisedTimeAtLocation</INCLUDE><INCLUDE>EstimatedTimeAtLocation</INCLUDE>
</QUERY>`)
      : [{}];
    const body = {
      from: A, to: B, roads: ROADS,
      out: outT, home: homeT,
      // Alla avgångar från Eskilstuna C (alla riktningar) närmaste 6 h.
      all: every?.TrainAnnouncement ?? [],
      arrivals: arr.TrainAnnouncement ?? [],
      situations: road.Situation ?? [],
      station: ws?.WeatherMeasurepoint?.[0] ?? null,
      stations: route?.WeatherMeasurepoint ?? [],
      fetched: new Date().toISOString(),
    };
    cache = { at: Date.now(), body };
    return json(body);
  } catch (e) {
    return json({ error: String(e) }, 502);
  }
});
