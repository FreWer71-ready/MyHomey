import { tint } from './scale.ts';
// Elpris: nuvarande pris, nivå mot dygnets snitt och billigaste tider. Ren logik.

/** Elprisområde för hemmet (Eskilstuna). */
export const PRICE_AREA = 'SE3';

export type Price = { start: number; end: number; ore: number }; // ms, öre/kWh
export type Level = { key: 'cheap' | 'normal' | 'high' | 'peak'; label: string; bg: string; bar: string };

export const LEVELS: Level[] = [
  { key: 'cheap', label: 'Billigt', bg: tint('#34C27A'), bar: '#34C27A' },
  { key: 'normal', label: 'Normalt', bg: tint('#E8B400'), bar: '#E8B400' },
  { key: 'high', label: 'Dyrt', bg: tint('#FF8A3D'), bar: '#FF8A3D' },
  { key: 'peak', label: 'Mycket dyrt', bg: tint('#F0503C'), bar: '#F0503C' },
];

/** Nivå relativt dygnets snitt (fasta öre-gränser fungerar inte när priserna svänger mellan år). */
export function levelOf(ore: number, avg: number): Level {
  const r = avg > 0 ? ore / avg : 1;
  return r < 0.8 ? LEVELS[0] : r < 1.1 ? LEVELS[1] : r < 1.4 ? LEVELS[2] : LEVELS[3];
}

const TZ = 'Europe/Stockholm';
export const dayKey = (ms: number) =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
export const hhmm = (ms: number) => new Date(ms).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: TZ });

export const avg = (ps: Price[]) => (ps.length ? ps.reduce((a, p) => a + p.ore, 0) / ps.length : 0);

/** Medelpris per timme (kvartspriser slås ihop). */
export function hourly(ps: Price[]): Price[] {
  const byHour = new Map<number, Price[]>();
  for (const p of ps) {
    const h = Math.floor(p.start / 3600_000) * 3600_000;
    if (!byHour.has(h)) byHour.set(h, []);
    byHour.get(h)!.push(p);
  }
  return [...byHour.entries()].sort((a, b) => a[0] - b[0]).map(([h, xs]) => ({ start: h, end: h + 3600_000, ore: avg(xs) }));
}

/** Billigaste sammanhängande fönster på `hours` timmar som börjar nu eller senare. */
export function cheapestWindow(ps: Price[], now: number, hours: number): { start: number; end: number; ore: number } | null {
  const future = ps.filter((p) => p.end > now).sort((a, b) => a.start - b.start);
  const slot = future.length > 1 ? future[1].start - future[0].start : 900_000;
  const n = Math.max(1, Math.round((hours * 3600_000) / slot));
  let best: { start: number; end: number; ore: number } | null = null;
  for (let i = 0; i + n <= future.length; i++) {
    const w = future.slice(i, i + n);
    if (w[n - 1].start - w[0].start !== (n - 1) * slot) continue; // lucka i datan
    const a = avg(w);
    if (!best || a < best.ore) best = { start: w[0].start, end: w[n - 1].end, ore: a };
  }
  return best;
}

export type PriceSummary = {
  now: Price | null;
  level: Level | null;
  todayAvg: number;
  todayMin: Price | null;
  todayMax: Price | null;
  cheapest1h: ReturnType<typeof cheapestWindow>;
  cheapest3h: ReturnType<typeof cheapestWindow>;
  hasTomorrow: boolean;
};

export function summarize(ps: Price[], now: number): PriceSummary {
  const today = ps.filter((p) => dayKey(p.start) === dayKey(now));
  const todayAvg = avg(today);
  const current = ps.find((p) => p.start <= now && now < p.end) ?? null;
  const by = (cmp: (a: Price, b: Price) => number) => (today.length ? [...today].sort(cmp)[0] : null);
  return {
    now: current,
    level: current ? levelOf(current.ore, todayAvg) : null,
    todayAvg,
    todayMin: by((a, b) => a.ore - b.ore),
    todayMax: by((a, b) => b.ore - a.ore),
    cheapest1h: cheapestWindow(ps, now, 1),
    cheapest3h: cheapestWindow(ps, now, 3),
    hasTomorrow: ps.some((p) => dayKey(p.start) === dayKey(now + 86400_000)),
  };
}

export const fmtOre = (ore: number | null | undefined) =>
  ore == null ? '–' : `${Math.round(ore).toLocaleString('sv-SE')} öre`;
