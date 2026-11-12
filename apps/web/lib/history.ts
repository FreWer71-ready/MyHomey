// Historik: mått, perioder och omvandling av databasrader till diagramserier. Ren logik.
import type { Device, Zone } from './home';

export type MetricKey = 'temp' | 'hum' | 'power' | 'energy';
export type PeriodKey = '4h' | '12h' | '24h' | '7d' | '30d';

export const METRICS: Record<MetricKey, {
  label: string; cap: string; unit: string; decimals: number;
  /** Enhetsklasser som räknas (tom = alla). Uttag och lampor mäter sin egen värme. */
  classes: string[];
  /** Mätarställning: visa förbrukning per intervall som staplar. */
  delta?: boolean;
}> = {
  temp: { label: 'Temperatur', cap: 'measure_temperature', unit: '°', decimals: 1, classes: ['sensor', 'service'] },
  hum: { label: 'Luftfuktighet', cap: 'measure_humidity', unit: ' %', decimals: 0, classes: [] },
  power: { label: 'Effekt', cap: 'measure_power', unit: ' W', decimals: 1, classes: [] },
  energy: { label: 'Energi', cap: 'meter_power', unit: ' kWh', decimals: 2, classes: [], delta: true },
};

export const PERIODS: Record<PeriodKey, { label: string; hours: number; bucket: string; barBucket: string }> = {
  '4h': { label: '4 tim', hours: 4, bucket: '5 minutes', barBucket: '15 minutes' },
  '12h': { label: '12 tim', hours: 12, bucket: '5 minutes', barBucket: '30 minutes' },
  '24h': { label: '24 tim', hours: 24, bucket: '10 minutes', barBucket: '1 hour' },
  '7d': { label: '7 dagar', hours: 24 * 7, bucket: '1 hour', barBucket: '6 hours' },
  '30d': { label: '30 dagar', hours: 24 * 30, bucket: '4 hours', barBucket: '1 day' },
};

/** Färger som skiljer sig både i ton och ljushet. */
const COLORS = ['#1E6FE0', '#FF7A1A', '#12B76A', '#E8418C', '#8B5CF6', '#0A8F9E', '#B48300', '#5B6180', '#B42318', '#3A3F5C'];

export type Row = { device_id: string; t: string; v: number; vmin: number; vmax: number };
export type Series = {
  id: string;
  label: string;
  color: string;
  /** [unix-sekunder, värde] */
  points: [number, number][];
  latest: number | null;
  min: number | null;
  max: number | null;
  total: number | null;
  /** Värdet är Homeys uppskattning, inte uppmätt. */
  estimated?: boolean;
};

export const isMetric = (m: string | undefined): m is MetricKey => !!m && m in METRICS;
export const isPeriod = (p: string | undefined): p is PeriodKey => !!p && p in PERIODS;

/** Mått där gamla värden betyder att sensorn är ej nåbar (samma regel som på Hem). */
export const STALE_CHECKED: MetricKey[] = ['temp', 'hum'];

export function buildSeries(
  metric: MetricKey, rows: Row[], devices: Device[], zones: Zone[], nowSec?: number, stale: Set<string> = new Set(),
): Series[] {
  const cfg = METRICS[metric];
  const zoneName = new Map(zones.map((z) => [z.id, z.name.trim()]));
  const byId = new Map(devices.map((d) => [d.id, d]));
  const grouped = new Map<string, Row[]>();
  for (const r of rows) {
    const d = byId.get(r.device_id);
    if (!d || stale.has(d.id) || (cfg.classes.length && !cfg.classes.includes(d.class ?? ''))) continue;
    if (!grouped.has(r.device_id)) grouped.set(r.device_id, []);
    grouped.get(r.device_id)!.push(r);
  }

  // Rumsnamn räcker om rummet bara har en serie; väderstation = Ute.
  const label = (d: Device) => {
    if (d.class === 'service') return 'Ute';
    const zone = zoneName.get(d.zone_id ?? '') ?? '';
    const sameZone = [...grouped.keys()].filter((id) => byId.get(id)?.zone_id === d.zone_id).length;
    return sameZone > 1 || !zone ? `${zone ? `${zone} · ` : ''}${d.name.trim()}` : zone;
  };

  const series = [...grouped.entries()].map(([id, rs]) => {
    rs.sort((a, b) => a.t.localeCompare(b.t));
    const sec = (t: string) => Math.round(new Date(t).getTime() / 1000);
    let points: [number, number][];
    if (cfg.delta) {
      // Förbrukning per intervall = skillnad i mätarställning (nollställning ignoreras).
      points = rs.slice(1).map((r, i) => [sec(r.t), Math.max(0, r.vmax - rs[i].vmax)]);
    } else {
      points = rs.map((r) => [sec(r.t), r.v]);
      // Senaste värdet gäller tills nästa ändring: dra linjen fram till nu.
      const last = points.at(-1);
      if (nowSec && last && nowSec > last[0]) points.push([nowSec, last[1]]);
    }
    const values = points.map((p) => p[1]);
    const lows = cfg.delta ? values : rs.map((r) => r.vmin);
    const highs = cfg.delta ? values : rs.map((r) => r.vmax);
    return {
      id,
      label: label(byId.get(id)!),
      color: '',
      points,
      latest: values.length ? values[values.length - 1] : null,
      min: lows.length ? Math.min(...lows) : null,
      max: highs.length ? Math.max(...highs) : null,
      total: cfg.delta ? values.reduce((a, b) => a + b, 0) : null,
    };
  });

  return series
    .filter((s) => s.points.length > 0)
    .sort((a, b) => (a.label === 'Ute' ? -1 : b.label === 'Ute' ? 1 : a.label.localeCompare(b.label, 'sv')))
    .map((s, i) => ({ ...s, color: COLORS[i % COLORS.length] }));
}

export const fmtValue = (metric: MetricKey, v: number | null) =>
  v == null
    ? '–'
    : `${v.toLocaleString('sv-SE', { minimumFractionDigits: METRICS[metric].decimals, maximumFractionDigits: METRICS[metric].decimals })}${METRICS[metric].unit}`;

/** Summerar flera serier per tidpunkt (t.ex. alla elmätare till en stapel). */
export function sumSeries(series: Series[], label: string, color: string): Series {
  const acc = new Map<number, number>();
  for (const s of series) for (const [t, v] of s.points) acc.set(t, (acc.get(t) ?? 0) + v);
  const points = [...acc.entries()].sort((a, b) => a[0] - b[0]) as [number, number][];
  const values = points.map((p) => p[1]);
  return {
    id: 'sum', label, color, points,
    latest: values.at(-1) ?? null,
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
    total: values.reduce((a, b) => a + b, 0),
  };
}
