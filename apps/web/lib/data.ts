import 'server-only';
import { createClient } from './supabase/server';
import { TEMP_MAX_DAYS, buildHome, CAPS, type Cap, type Device, type Home, type Mood, type Zone } from './home';
import { PRICE_AREA, type Price } from './prices';
import { startOfDayStockholm } from './time';
import { solarElevation } from './sky';
import { parseMet, parseSmhi, smhiDays, summarizeWeather, type WeatherSummary } from './weather';
import { MEDIA_CAPS, TV_CAPS, nowPlaying, tvRemote, type MediaCap, type NowPlaying, type TvCap, type TvDevice, type TvRemote } from './media';
import { summarizeNet, type Net, type NetDevice, type NetIsp, type NetStatusRow } from './net';
import { smhiWarnings, storms, vmas, type SmhiWarning, type Storm, type Vma } from './warnings';
import { buildPresence, buildTimeline, type OnOffRow, type RoomLines } from './timeline';
import { parseCommute, type Commute, type RawCommute } from './commute';
import { buildSeries, METRICS, PERIODS, STALE_CHECKED, type MetricKey, type PeriodKey, type Row, type Series } from './history';

/** Lokalt demoläge (bara `next dev`): läser JSON i stället för Supabase. */
export const DEMO = process.env.NODE_ENV === 'development' ? process.env.DEMO_DATA : undefined;

export async function loadHome(): Promise<Home> {
  if (DEMO) {
    const { readFile } = await import('node:fs/promises');
    const d = JSON.parse(await readFile(DEMO, 'utf8'));
    // Demo: några rum och ute med trend.
    return buildHome(d.zones, d.devices, d.caps, d.moods ?? [], Date.now(), { vt: 0.6, st: -0.5, wx: -0.9, ...(d.trends ?? {}) });
  }
  const sb = await createClient();
  const [zones, devices, caps, moods, hour] = await Promise.all([
    sb.from('zones').select('id,name,parent_id'),
    sb.from('devices').select('id,name,zone_id,class,available'),
    sb.from('capability_state').select('device_id,capability_id,value_num,value_bool,last_updated').in('capability_id', CAPS),
    sb.from('moods').select('id,name,zone_id,favorite'),
    // Temperaturen för en timme sedan (första minutbucketen bär med värdet före perioden).
    sb.rpc('history', { cap: 'measure_temperature', since: new Date(Date.now() - 3600_000).toISOString(), bucket: '1 minute' }),
  ]);
  const error = zones.error ?? devices.error ?? caps.error ?? moods.error;
  if (error) throw new Error(`Kunde inte läsa data: ${error.message}`);
  return buildHome(zones.data as Zone[], devices.data as Device[], caps.data as Cap[], moods.data as Mood[], Date.now(),
    tempTrends((hour.data ?? []) as Row[], caps.data as Cap[]));
}

export async function loadHistory(metric: MetricKey, period: PeriodKey): Promise<Series[]> {
  const cfg = METRICS[metric];
  const p = PERIODS[period];
  const since = new Date(Date.now() - p.hours * 3600_000).toISOString();
  const bucket = cfg.delta ? p.barBucket : p.bucket;

  if (DEMO) {
    const { readFile } = await import('node:fs/promises');
    const d = JSON.parse(await readFile(DEMO, 'utf8'));
    return buildSeries(metric, demoRows(d.caps, cfg.cap, p.hours, cfg.delta ? 3600 : 600), d.devices, d.zones);
  }

  const sb = await createClient();
  const [zones, devices, rows, latest, est] = await Promise.all([
    sb.from('zones').select('id,name,parent_id'),
    sb.from('devices').select('id,name,zone_id,class,available'),
    sb.rpc('history', { cap: cfg.cap, since, bucket }),
    sb.from('capability_state').select('device_id,last_updated').eq('capability_id', cfg.cap),
    // Effekt: Homeys uppskattning för enheter utan egen mätare.
    metric === 'power' ? sb.rpc('history', { cap: 'measure_power.homey', since, bucket }) : Promise.resolve({ data: [], error: null }),
  ]);
  const error = zones.error ?? devices.error ?? rows.error ?? latest.error;
  if (error) throw new Error(`Kunde inte läsa historik: ${error.message}`);
  // Inaktuella sensorer (inget nytt värde på TEMP_MAX_DAYS dagar) visas inte.
  const stale = new Set(
    STALE_CHECKED.includes(metric)
      ? (latest.data ?? []).filter((c) => Date.now() - Date.parse(c.last_updated) > TEMP_MAX_DAYS * 86400_000).map((c) => c.device_id)
      : [],
  );
  const measured = new Set((rows.data as Row[]).map((r) => r.device_id));
  const estRows = ((est.data ?? []) as Row[]).filter((r) => !measured.has(r.device_id));
  const estIds = new Set(estRows.map((r) => r.device_id));
  return buildSeries(metric, [...(rows.data as Row[]), ...estRows], devices.data as Device[], zones.data as Zone[], Math.floor(Date.now() / 1000), stale)
    .map((x) => (estIds.has(x.id) ? { ...x, estimated: true } : x));
}

/** Ändring senaste timmen per enhet: nuvärde minus första värdet i perioden. Trenden får aldrig stoppa sidan. */
function tempTrends(rows: Row[], caps: Cap[]): Record<string, number> {
  const first = new Map<string, number>();
  for (const r of [...rows].sort((a, b) => a.t.localeCompare(b.t))) if (!first.has(r.device_id)) first.set(r.device_id, r.v);
  const out: Record<string, number> = {};
  for (const c of caps) {
    const was = first.get(c.device_id);
    if (c.capability_id === 'measure_temperature' && c.value_num != null && was != null) out[c.device_id] = c.value_num - was;
  }
  return out;
}

/** Påhittade kurvor kring nuvarande värden, bara för demoläget. */
function demoRows(caps: Cap[], cap: string, hours: number, step: number): Row[] {
  const now = Math.floor(Date.now() / 1000 / step) * step;
  const out: Row[] = [];
  const meter = cap === 'meter_power';
  const source = meter ? caps.filter((c) => c.capability_id === 'measure_power') : caps.filter((c) => c.capability_id === cap);
  for (const c of source) {
    let total = 100;
    for (let t = now - hours * 3600; t <= now; t += step) {
      const day = Math.sin((t / 86400) * 2 * Math.PI + c.device_id.length);
      const base = c.value_num ?? 0;
      const v = meter ? (total += Math.max(0, (base + 5 * day) * (step / 3600) / 1000)) : base + (cap === 'measure_temperature' ? 1.5 : 0.2 * base + 3) * day;
      out.push({ device_id: c.device_id, t: new Date(t * 1000).toISOString(), v, vmin: v - 0.2, vmax: v + 0.2 });
    }
  }
  return out;
}

export async function loadLightTimeline(period: PeriodKey): Promise<{ rooms: RoomLines[]; since: number; now: number }> {
  const now = Date.now();
  const since = now - PERIODS[period].hours * 3600_000;
  if (DEMO) {
    const { readFile } = await import('node:fs/promises');
    const d = JSON.parse(await readFile(DEMO, 'utf8'));
    const rows: OnOffRow[] = (d.caps as Cap[]).filter((c) => c.capability_id === 'onoff').flatMap((c, i) =>
      [0, 1, 2, 3].map((k) => ({ device_id: c.device_id, ts: new Date(since + ((k * 6 + (i % 5)) * 3600_000 * PERIODS[period].hours) / 24).toISOString(), value: (k + i) % 2 })));
    return { rooms: buildTimeline(rows, d.devices, d.zones, since, now), since, now };
  }
  const sb = await createClient();
  const [zones, devices, rows] = await Promise.all([
    sb.from('zones').select('id,name,parent_id'),
    sb.from('devices').select('id,name,zone_id,class,available'),
    sb.rpc('onoff_timeline', { since: new Date(since).toISOString() }),
  ]);
  const error = zones.error ?? devices.error ?? rows.error;
  if (error) throw new Error(`Kunde inte läsa tidslinje: ${error.message}`);
  return { rooms: buildTimeline(rows.data as OnOffRow[], devices.data as Device[], zones.data as Zone[], since, now), since, now };
}

/** Spotpriser från i går kväll till och med i morgon (öre/kWh). */
export async function loadPrices(): Promise<Price[]> {
  const now = Date.now();
  if (DEMO) {
    const first = Math.floor((now - 14 * 3600_000) / 900_000) * 900_000;
    return Array.from({ length: 50 * 4 }, (_, i) => {
      const start = first + i * 900_000;
      const h = new Date(start).getHours();
      const peak = (h >= 7 && h < 9) || (h >= 17 && h < 20) ? 120 : 0;
      return { start, end: start + 900_000, ore: 140 + 70 * Math.sin(((h - 9) / 24) * 2 * Math.PI) + peak };
    });
  }
  const sb = await createClient();
  const { data, error } = await sb
    .from('spot_prices')
    .select('start_ts,end_ts,sek_per_kwh')
    .eq('area', PRICE_AREA)
    .gte('start_ts', new Date(now - 26 * 3600_000).toISOString())
    .lt('start_ts', new Date(now + 36 * 3600_000).toISOString())
    .order('start_ts');
  if (error) throw new Error(`Kunde inte läsa elpriser: ${error.message}`);
  return (data ?? []).map((p) => ({ start: Date.parse(p.start_ts), end: Date.parse(p.end_ts), ore: p.sek_per_kwh * 100 }));
}

/** Plats för väder och bakgrund (WEATHER_LAT/WEATHER_LON i Vercel, annars Eskilstuna). */
export const PLACE = { lat: Number(process.env.WEATHER_LAT ?? 59.3712), lon: Number(process.env.WEATHER_LON ?? 16.5098) };

/** Väderprognos från SMHI (Yr som reserv), cachas 30 min. Plats via WEATHER_LAT/WEATHER_LON. */
export async function loadWeather(): Promise<WeatherSummary | null> {
  const now = Date.now();
  if (DEMO) {
    const sym = ['partlycloudy_night', 'partlycloudy_night', 'lightrain', 'rain', 'cloudy', 'partlycloudy_day', 'clearsky_day', 'fair_day'];
    const hours = Array.from({ length: 24 }, (_, h) => ({ time: Math.floor(now / 3600_000) * 3600_000 + h * 3600_000, symbol: sym[Math.floor(h / 3) % 8], precip: [2, 3].includes(Math.floor(h / 3) % 8) ? 0.4 + (h % 3) * 0.3 : 0, temp: 2 + 3 * Math.sin(h / 4) }));
    const days = Array.from({ length: 5 }, (_, i) => ({
      date: new Date(now + (i + 1) * 86400_000).toISOString().slice(0, 10), min: -2 + i, max: 3 + (i % 3),
      precip: [0, 2.4, 0.3, 0, 5.1][i], symbol: ['partlycloudy_day', 'rain', 'lightrainshowers_day', 'clearsky_day', 'heavyrain'][i],
    }));
    return { ...summarizeWeather(hours, now)!, source: 'SMHI', days };
  }
  const { lat, lon } = PLACE;
  const get = async (url: string, headers?: Record<string, string>) => {
    try {
      const res = await fetch(url, { headers, next: { revalidate: 1800 }, signal: AbortSignal.timeout(6000) });
      return res.ok ? await res.json() : null;
    } catch {
      return null; // Vädret får aldrig stoppa sidan.
    }
  };
  const smhi = await get(`https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/geotype/point/lon/${lon.toFixed(4)}/lat/${lat.toFixed(4)}/data.json`);
  const fromSmhi = smhi && summarizeWeather(parseSmhi(smhi, (ms) => solarElevation(ms, lat, lon) > -0.833), now);
  if (fromSmhi) return { ...fromSmhi, source: 'SMHI', days: smhiDays(smhi, now) };
  const met = await get(`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`, { 'User-Agent': 'MyHomey-dashboard/1.0' });
  const fromMet = met && summarizeWeather(parseMet(met), now);
  return fromMet ? { ...fromMet, source: 'Yr' } : null;
}

/** Antal öppningar per dörr/fönster (alarm_contact → öppen) sedan midnatt. */
export async function loadOpeningsToday(): Promise<Record<string, number>> {
  if (DEMO) return { hd: 7 };
  const sb = await createClient();
  const { data, error } = await sb
    .from('readings')
    .select('device_id')
    .eq('capability_id', 'alarm_contact')
    .eq('value', 1)
    .gte('ts', new Date(startOfDayStockholm()).toISOString());
  if (error) throw new Error(`Kunde inte läsa dörröppningar: ${error.message}`);
  const counts: Record<string, number> = {};
  for (const r of data ?? []) counts[r.device_id] = (counts[r.device_id] ?? 0) + 1;
  return counts;
}

/** Dagens namnsdag ur tabellen name_days (fylls månadsvis av edge-funktionen name-days). */
export async function loadNameDay(): Promise<string[]> {
  const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(Date.now());
  if (DEMO) return ['Mårten'];
  const sb = await createClient();
  const { data } = await sb.from('name_days').select('names').eq('date', day).maybeSingle();
  return data?.names ?? []; // Namnsdagen får aldrig stoppa sidan.
}

/** Vad som spelas på Chromecast-enheter (Google TV, Nest hub; Spotify syns när den castar). */
export async function loadNowPlaying(): Promise<NowPlaying[]> {
  if (DEMO) return [
    { id: 'tv', device: 'Google TV vardagsrum', kind: 'tv', playing: true, title: 'Netflix', subtitle: 'Stranger Things' },
    { id: 'hub', device: 'Nest hub', kind: 'music', playing: true, title: 'Feels Like I’m Falling in Love', subtitle: 'Coldplay · Spotify' },
  ];
  const sb = await createClient();
  const [devices, caps] = await Promise.all([
    sb.from('devices').select('id,name').eq('class', 'speaker').eq('available', true).like('driver_id', '%chromecast%'),
    sb.from('capability_state').select('device_id,capability_id,value_bool,value_text,last_updated').in('capability_id', MEDIA_CAPS),
  ]);
  if (devices.error || caps.error) return []; // Media får aldrig stoppa sidan.
  return nowPlaying(devices.data, caps.data as MediaCap[]);
}

/** Internet- och nätverkshälsa (UniFi, senaste 24 h). Null om UniFi-data saknas. */
export async function loadNet(): Promise<Net | null> {
  if (DEMO) {
    const t = Math.floor(Date.now() / 300_000) * 300_000;
    const isp = Array.from({ length: 288 }, (_, i) => ({
      ts: new Date(t - (288 - i) * 300_000).toISOString(), latency_ms: 3 + (i % 37 === 0 ? 9 : i % 3), packet_loss: 0,
      download_kbps: 300000, upload_kbps: 300000, uptime: 100, downtime: 0,
    }));
    const dev = (id: string, name: string, model: string, is_console = false) => ({ id, name, model, status: 'online', firmware_status: 'upToDate', is_console });
    return summarizeNet({ isp: 'Telia', wifi_clients: 16, wired_clients: 3, internet_issues: [], checked_at: new Date().toISOString() }, isp,
      [dev('ux', 'Wernqvist base', 'Express', true), dev('sw', 'Switch 16 PoE', 'USW 16 PoE'), dev('ap1', 'UAP-AC-Pro Inne', 'AC Pro'), dev('ap2', 'AP AC Mesh Ute', 'AC Mesh')]);
  }
  const sb = await createClient();
  const [status, isp, devices] = await Promise.all([
    sb.from('net_status').select('isp,wifi_clients,wired_clients,internet_issues,checked_at').maybeSingle(),
    sb.from('net_isp').select('ts,latency_ms,packet_loss,download_kbps,upload_kbps,uptime,downtime')
      .gte('ts', new Date(Date.now() - 24 * 3600_000).toISOString()).order('ts'),
    sb.from('net_devices').select('id,name,model,status,firmware_status,is_console').order('is_console', { ascending: false }).order('name'),
  ]);
  if (status.error || isp.error || devices.error) return null; // Nätverket får aldrig stoppa sidan.
  return summarizeNet(status.data as NetStatusRow | null, (isp.data ?? []) as NetIsp[], (devices.data ?? []) as NetDevice[]);
}

export type Flow = { id: string; name: string; advanced: boolean };

/** Favoritflows från Homey (tabellen innehåller bara favoriter). */
export async function loadFlows(): Promise<Flow[]> {
  if (DEMO) return [{ id: 'f1', name: 'Godnatt', advanced: false }, { id: 'f2', name: 'Morgonrutin', advanced: true }, { id: 'f3', name: 'Lämnar huset', advanced: false }];
  const sb = await createClient();
  const { data, error } = await sb.from('flows').select('id,name,advanced').order('name');
  return error ? [] : (data as Flow[]);
}

/** Närvarohistorik (Smart Presence) som tidslinje per person. */
export async function loadPresenceTimeline(period: PeriodKey): Promise<{ rooms: RoomLines[]; since: number; now: number }> {
  const now = Date.now();
  const since = now - PERIODS[period].hours * 3600_000;
  if (DEMO) {
    const { readFile } = await import('node:fs/promises');
    const d = JSON.parse(await readFile(DEMO, 'utf8'));
    const ids = (d.caps as Cap[]).filter((c) => c.capability_id === 'presence').map((c) => c.device_id);
    const rows: OnOffRow[] = ids.flatMap((id, i) => [0, 1, 2, 3, 4, 5].map((k) => ({
      device_id: id, ts: new Date(since + ((k * 4 + i) / 24) * (now - since)).toISOString(), value: (k + i) % 2 === 0 ? 1 : 0,
    })));
    return { rooms: buildPresence(rows, d.devices, since, now), since, now };
  }
  const sb = await createClient();
  const [devices, rows] = await Promise.all([
    sb.from('devices').select('id,name,zone_id,class,available'),
    sb.rpc('bool_timeline', { cap: 'presence', since: new Date(since).toISOString() }),
  ]);
  if (devices.error || rows.error) throw new Error(`Kunde inte läsa närvaro: ${(devices.error ?? rows.error)!.message}`);
  return { rooms: buildPresence(rows.data as OnOffRow[], devices.data as Device[], since, now), since, now };
}

export type HueScene = { id: string; name: string; room: string | null; colors: string[]; dynamic: boolean; active: boolean };

/** Hue-scener via edge-funktionen hue. connected=false om Hue inte är kopplat än. */
export async function loadHueScenes(): Promise<{ connected: boolean; scenes: HueScene[] }> {
  if (DEMO) {
    return { connected: true, scenes: [
      { id: 'h1', name: 'Solnedgång Savannah', room: 'Vardagsrum', colors: ['#ff8a3d', '#ff5a5a', '#ffc21a'], dynamic: true, active: false },
      { id: 'h2', name: 'Läsa', room: 'Vardagsrum', colors: ['#fff4e0'], dynamic: false, active: true },
      { id: 'h3', name: 'Nordljus', room: 'Vardagsrum', colors: ['#2bb5c4', '#34c27a', '#8b5cf6'], dynamic: true, active: false },
    ] };
  }
  const sb = await createClient();
  const { data, error } = await sb.functions.invoke('hue', { body: { action: 'scenes' } });
  if (error || !data) return { connected: false, scenes: [] };
  return { connected: !!data.connected, scenes: (data.scenes ?? []) as HueScene[] };
}

export type WineCellar = { total: number; by_color: Record<string, number>; latest: { name?: string; producer?: string; year?: number } | null; updated_at: string };

/** Vinkällaren (från Trandvine via wine-ingest). Null om hushållet inte har någon källare kopplad. */
export async function loadWine(): Promise<WineCellar | null> {
  if (DEMO) return { total: 27, by_color: { red: 21, white: 4, sparkling: 2 }, latest: { name: 'Amarone della Valpolicella Classico', producer: 'Zenato', year: 2020 }, updated_at: new Date().toISOString() };
  const sb = await createClient();
  const { data } = await sb.from('wine_cellar').select('total,by_color,latest,updated_at').maybeSingle();
  return (data as WineCellar | null) ?? null;
}

/** Vinkällarens historik som trappsteg: [unix-sekunder, antal], förlängd till nu. */
export async function loadWineHistory(): Promise<[number, number][]> {
  let rows: { ts: string; total: number }[];
  if (DEMO) {
    rows = [['2025-10-31', 2], ['2026-01-01', 3], ['2026-10-27', 6], ['2026-10-28', 11], ['2026-10-30', 10], ['2026-10-31', 27]]
      .map(([d, n]) => ({ ts: `${d}T00:00:00Z`, total: n as number }));
  } else {
    const sb = await createClient();
    const { data } = await sb.from('wine_history').select('ts,total').order('ts');
    rows = data ?? [];
  }
  const pts: [number, number][] = [];
  for (const r of rows) {
    const t = Math.round(Date.parse(r.ts) / 1000);
    if (pts.length) pts.push([t - 1, pts[pts.length - 1][1]]); // trappsteg: gamla värdet fram till ändringen
    pts.push([t, r.total]);
  }
  if (pts.length) pts.push([Math.round(Date.now() / 1000), pts[pts.length - 1][1]]);
  return pts;
}

export type Warnings = { smhi: SmhiWarning[]; vma: Vma[]; storms: Storm[] };

/**
 * SMHI:s vädervarningar och VMA (Krisinformation) för området (WARNING_AREA, standard Södermanland/Eskilstuna)
 * samt kommande oväder ur prognosen. Cachas 5 min; en källa som inte svarar ger bara tom lista.
 */
export async function loadWarnings(weather: WeatherSummary | null): Promise<Warnings> {
  const area = new RegExp(process.env.WARNING_AREA ?? 'Södermanland|Eskilstuna', 'i');
  const stormList = storms(weather?.hours ?? []);
  if (DEMO) {
    return {
      smhi: [{ id: 'd1', level: 'yellow', event: 'Kraftig vind', area: 'Södermanlands län', start: Date.now() + 6 * 3600_000, end: Date.now() + 20 * 3600_000, text: 'Byvindar 23–25 m/s.' }],
      vma: [], storms: stormList,
    };
  }
  const get = async (url: string) => {
    try {
      const res = await fetch(url, { next: { revalidate: 300 }, signal: AbortSignal.timeout(6000) });
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  };
  const [s, v] = await Promise.all([
    get('https://opendata-download-warnings.smhi.se/ibww/api/version/1/warning.json'),
    get('https://api.krisinformation.se/v3/vmas'),
  ]);
  return { smhi: s ? smhiWarnings(s, area) : [], vma: v ? vmas(v, area) : [], storms: stormList };
}

/**
 * Pendling (Trafikverket via edge-funktionen trafik). COMMUTE=off stänger av, COMMUTE=road ger bara vägen (t.ex. Ulrikas).
 * Null om avstängt
 * eller om källan inte svarar.
 */
export async function loadCommute(): Promise<Commute | null> {
  if (process.env.COMMUTE === 'off') return null;
  const roadOnly = (c: Commute): Commute => (process.env.COMMUTE === 'road' ? { ...c, out: [], home: [], trains: false } : c);
  if (DEMO) {
    const at = (min: number) => new Date(Date.now() + min * 60_000).toISOString();
    return roadOnly(parseCommute({
      out: [
        { AdvertisedTrainIdent: '954', AdvertisedTimeAtLocation: at(12), EstimatedTimeAtLocation: at(19), LocationSignature: 'Et', ToLocation: [{ LocationName: 'U' }], TrackAtLocation: '1', Deviation: [{ Description: 'Försenad' }] },
        { AdvertisedTrainIdent: '10922', AdvertisedTimeAtLocation: at(44), LocationSignature: 'Et', ToLocation: [{ LocationName: 'Cst' }], TrackAtLocation: '1' },
        { AdvertisedTrainIdent: '958', AdvertisedTimeAtLocation: at(72), Canceled: true, LocationSignature: 'Et', ToLocation: [{ LocationName: 'U' }], Deviation: [{ Description: 'Inställt' }] },
      ],
      home: [{ AdvertisedTrainIdent: '10921', AdvertisedTimeAtLocation: at(25), LocationSignature: 'Cst', ToLocation: [{ LocationName: 'Et' }], TrackAtLocation: '16a' }],
      arrivals: [{ AdvertisedTrainIdent: '954', LocationSignature: 'Cst', AdvertisedTimeAtLocation: at(75) }],
      situations: [{ Deviation: [{ Id: 'k', MessageType: 'Vägarbete', MessageTypeValue: 'MaintenanceWorks', SeverityCode: 4, Message: 'Ett avstängt körfält. Risk för köbildning.', LocationDescriptor: 'Väg 56 från Stora Ekeby till Kvicksund S', EndTime: '2027-09-30T16:00:00+02:00' }] }],
    }));
  }
  const sb = await createClient();
  const { data, error } = await sb.functions.invoke('trafik', { body: {} });
  if (error || !data || data.error) return null;
  return roadOnly(parseCommute(data as RawCommute));
}

/** TV-fjärren (The Frame via SmartThings, Google TV och soundbar via Chromecast). Null utan TV i Homey. */
export async function loadTv(): Promise<TvRemote | null> {
  if (DEMO) return { zone: 'vardagsrum', tv: { id: 'tv', name: 'Samsung The Frame 75', on: true }, cast: { id: 'tv', playing: true, muted: false }, bar: null };
  if (process.env.CONTROL === 'hue') return null;
  const sb = await createClient();
  const { data: devices } = await sb.from('devices').select('id,name,class,zone_id,driver_id').in('class', ['tv', 'speaker']).eq('available', true);
  if (!devices?.some((d) => d.class === 'tv')) return null;
  const { data: caps } = await sb.from('capability_state').select('device_id,capability_id,value_bool,value_num')
    .in('device_id', devices.map((d) => d.id)).in('capability_id', TV_CAPS);
  return tvRemote(devices as TvDevice[], (caps ?? []) as TvCap[]);
}

export type TvStatus = { device_id: string; is_on: boolean; app_name: string | null; media_title: string | null; media_artist: string | null; media_status: string; updated_at: string; changed_at?: string; current_app?: string | null };

/**
 * TV-status från den lokala TV-agenten (agents/tv-adb): en rad per enhet (Google TV, The Frame).
 * Bara färsk data (agenten skickar minst varje minut); äldre rader räknas inte.
 */
export async function loadTvStatuses(): Promise<TvStatus[]> {
  if (DEMO) return [
    { device_id: 'google-tv', is_on: true, app_name: 'Netflix', media_title: 'Stranger Things', media_artist: 'S4:E1 Chapter One', media_status: 'playing', updated_at: new Date().toISOString() },
    { device_id: 'the-frame', is_on: false, app_name: 'Konstläge', media_title: null, media_artist: null, media_status: 'none', updated_at: new Date().toISOString() },
  ];
  const sb = await createClient();
  const { data } = await sb.from('tv_status').select('device_id,is_on,current_app,app_name,media_title,media_artist,media_status,updated_at,changed_at').order('updated_at', { ascending: false });
  return ((data ?? []) as TvStatus[]).filter((r) => Date.now() - Date.parse(r.updated_at) <= 3 * 60_000);
}

/** Dörr/fönster-händelser: open = true när kontakten bröts. Nyast först. */
export type ContactEvent = { device: string; ts: number; open: boolean };

/** Logg för dörr- och fönstersensorer (alarm_contact) de senaste `days` dagarna. Upprepade värden slås ihop. */
export async function loadContactLog(ids: string[], days = 7): Promise<ContactEvent[]> {
  if (!ids.length) return [];
  let rows: { device_id: string; ts: string; value: number }[];
  if (DEMO) {
    const now = Date.now();
    rows = ids.flatMap((id, i) => Array.from({ length: 6 }, (_, k) => [
      { device_id: id, ts: new Date(now - (k * 9 + i * 3 + 1) * 3600_000).toISOString(), value: 1 },
      { device_id: id, ts: new Date(now - (k * 9 + i * 3 + 1) * 3600_000 + (4 + i * 7) * 60_000).toISOString(), value: 0 },
    ]).flat());
  } else {
    const sb = await createClient();
    const { data } = await sb.from('readings').select('device_id,ts,value')
      .eq('capability_id', 'alarm_contact').in('device_id', ids)
      .gte('ts', new Date(Date.now() - days * 86400_000).toISOString()).order('ts', { ascending: true }).limit(2000);
    rows = data ?? [];
  }
  rows.sort((a, b) => a.ts.localeCompare(b.ts));
  const last = new Map<string, boolean>();
  const out: ContactEvent[] = [];
  for (const r of rows) {
    const open = r.value > 0;
    if (last.get(r.device_id) === open) continue;
    last.set(r.device_id, open);
    out.push({ device: r.device_id, ts: Date.parse(r.ts), open });
  }
  return out.reverse();
}
