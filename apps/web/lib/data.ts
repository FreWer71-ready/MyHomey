import 'server-only';
import { createClient } from './supabase/server';
import { TEMP_MAX_DAYS, buildHome, CAPS, type Cap, type Device, type Home, type Mood, type Zone } from './home';
import { PRICE_AREA, type Price } from './prices';
import { startOfDayStockholm } from './time';
import { parseMet, summarizeWeather, type WeatherSummary } from './weather';
import { MEDIA_CAPS, nowPlaying, type MediaCap, type NowPlaying } from './media';
import { buildTimeline, type OnOffRow, type RoomLines } from './timeline';
import { buildSeries, METRICS, PERIODS, STALE_CHECKED, type MetricKey, type PeriodKey, type Row, type Series } from './history';

/** Lokalt demoläge (bara `next dev`): läser JSON i stället för Supabase. */
export const DEMO = process.env.NODE_ENV === 'development' ? process.env.DEMO_DATA : undefined;

export async function loadHome(): Promise<Home> {
  if (DEMO) {
    const { readFile } = await import('node:fs/promises');
    const d = JSON.parse(await readFile(DEMO, 'utf8'));
    return buildHome(d.zones, d.devices, d.caps, d.moods ?? []);
  }
  const sb = await createClient();
  const [zones, devices, caps, moods] = await Promise.all([
    sb.from('zones').select('id,name,parent_id'),
    sb.from('devices').select('id,name,zone_id,class,available'),
    sb.from('capability_state').select('device_id,capability_id,value_num,value_bool,last_updated').in('capability_id', CAPS),
    sb.from('moods').select('id,name,zone_id,favorite'),
  ]);
  const error = zones.error ?? devices.error ?? caps.error ?? moods.error;
  if (error) throw new Error(`Kunde inte läsa data: ${error.message}`);
  return buildHome(zones.data as Zone[], devices.data as Device[], caps.data as Cap[], moods.data as Mood[]);
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
  const [zones, devices, rows, latest] = await Promise.all([
    sb.from('zones').select('id,name,parent_id'),
    sb.from('devices').select('id,name,zone_id,class,available'),
    sb.rpc('history', { cap: cfg.cap, since, bucket }),
    sb.from('capability_state').select('device_id,last_updated').eq('capability_id', cfg.cap),
  ]);
  const error = zones.error ?? devices.error ?? rows.error ?? latest.error;
  if (error) throw new Error(`Kunde inte läsa historik: ${error.message}`);
  // Inaktuella sensorer (inget nytt värde på TEMP_MAX_DAYS dagar) visas inte.
  const stale = new Set(
    STALE_CHECKED.includes(metric)
      ? (latest.data ?? []).filter((c) => Date.now() - Date.parse(c.last_updated) > TEMP_MAX_DAYS * 86400_000).map((c) => c.device_id)
      : [],
  );
  return buildSeries(metric, rows.data as Row[], devices.data as Device[], zones.data as Zone[], Math.floor(Date.now() / 1000), stale);
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

/** Väderprognos (MET Norway), cachas 30 min. Plats via WEATHER_LAT/WEATHER_LON, annars Eskilstuna. */
export async function loadWeather(): Promise<WeatherSummary | null> {
  const now = Date.now();
  if (DEMO) {
    const hours = [0, 1, 2, 3].map((h) => ({ time: Math.floor(now / 3600_000) * 3600_000 + h * 3600_000, symbol: h < 2 ? 'partlycloudy_night' : 'lightrain', precip: h < 2 ? 0 : 0.5, temp: 3 }));
    return summarizeWeather(hours, now);
  }
  const { lat, lon } = PLACE;
  try {
    const res = await fetch(`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`, {
      headers: { 'User-Agent': 'MyHomey-dashboard/1.0' },
      next: { revalidate: 1800 },
    });
    if (!res.ok) return null;
    return summarizeWeather(parseMet(await res.json()), now);
  } catch {
    return null; // Vädret får aldrig stoppa sidan.
  }
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
    { id: 'hub', device: 'Nest hub', kind: 'music', playing: false, title: 'Feels Like I’m Falling in Love', subtitle: 'Coldplay · Spotify' },
  ];
  const sb = await createClient();
  const [devices, caps] = await Promise.all([
    sb.from('devices').select('id,name').eq('class', 'speaker').eq('available', true).like('driver_id', '%chromecast%'),
    sb.from('capability_state').select('device_id,capability_id,value_bool,value_text').in('capability_id', MEDIA_CAPS),
  ]);
  if (devices.error || caps.error) return []; // Media får aldrig stoppa sidan.
  return nowPlaying(devices.data, caps.data as MediaCap[]);
}
