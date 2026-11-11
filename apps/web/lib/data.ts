import 'server-only';
import { createClient } from './supabase/server';
import { buildHome, CAPS, type Cap, type Device, type Home, type Mood, type Zone } from './home';
import { buildTimeline, type OnOffRow, type RoomLines } from './timeline';
import { buildSeries, METRICS, PERIODS, type MetricKey, type PeriodKey, type Row, type Series } from './history';

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
    sb.from('capability_state').select('device_id,capability_id,value_num,value_bool').in('capability_id', CAPS),
    sb.from('moods').select('id,name,zone_id'),
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
  const [zones, devices, rows] = await Promise.all([
    sb.from('zones').select('id,name,parent_id'),
    sb.from('devices').select('id,name,zone_id,class,available'),
    sb.rpc('history', { cap: cfg.cap, since, bucket }),
  ]);
  const error = zones.error ?? devices.error ?? rows.error;
  if (error) throw new Error(`Kunde inte läsa historik: ${error.message}`);
  return buildSeries(metric, rows.data as Row[], devices.data as Device[], zones.data as Zone[]);
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
