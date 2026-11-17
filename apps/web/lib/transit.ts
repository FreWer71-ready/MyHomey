// Kollektivresa (ResRobot v2.1, Trafiklab): gång, buss, tåg, SL. Ren tolkning här; hämtningen i transit-source.ts.
import { zoned } from './calendar.ts';

export type LegKind = 'walk' | 'train' | 'bus' | 'metro' | 'tram' | 'other';
export type TransitLeg = {
  kind: LegKind; from: string; to: string; dep: number; arr: number; minutes: number;
  /** "Regionaltåg 914", "Pendeltåg 41", "Buss 3"; null för gång. */ label: string | null;
  /** Tåg-/linjenummer (matchas mot Trafikverkets realtid för tåg). */ num: string | null;
  dir: string | null; track: string | null;
};
export type TransitTrip = { dep: number; arr: number; legs: TransitLeg[]; /** Första hållplatsens läge. */ startAt: { lat: number; lon: number } | null };

type RawStop = { name: string; date: string; time: string; lat?: number; lon?: number; track?: string; rtTrack?: string; rtTime?: string; rtDate?: string };
type RawLeg = { type: string; name?: string; direction?: string; Origin: RawStop; Destination: RawStop; Product?: { name?: string; num?: string; catOutL?: string } | { name?: string; num?: string; catOutL?: string }[] };

const ms = (s: RawStop, rt = true) => {
  const [y, m, d] = (rt && s.rtDate ? s.rtDate : s.date).split('-').map(Number);
  const [h, mi, se] = (rt && s.rtTime ? s.rtTime : s.time).split(':').map(Number);
  return zoned(y, m, d, h, mi, se || 0);
};
/** Korta stoppnamn: "Årstaberg station (Stockholm kn)" → "Årstaberg", "Eskilstuna Centralstation" → "Eskilstuna C",
 *  "Fredsborgsgatan 24, Liljeholmen" → "Fredsborgsgatan 24"; koordinater → "Start". */
export const stopName = (n: string) => (/^\s*-?\d+\.\d+,\s*-?\d+\.\d+\s*$/.test(n) ? 'Start'
  : n.replace(/\s*\([^)]*\bkn\)\s*$/, '').split(',')[0].replace(/\s+Centralstation$/i, ' C').replace(/\s+station$/i, '').trim());

function kindOf(name: string): LegKind {
  const n = name.toLowerCase();
  if (/tunnelbana|metro/.test(n)) return 'metro';
  if (/spårvagn|lokalbana/.test(n)) return 'tram';
  if (/tåg|pendel/.test(n)) return 'train';
  if (/buss/.test(n)) return 'bus';
  return 'other';
}
/** "Länstrafik tåg 41" → "Pendeltåg 41" (SL), "Regional tåg 914" → "Regionaltåg 914", "Länstrafik buss 3" → "Buss 3". */
function labelOf(name: string, kind: LegKind, sl: boolean): string {
  const base = name.replace(/^Länstrafik\s+/i, '').replace(/^Regional tåg/i, 'Regionaltåg').trim();
  const fixed = kind === 'train' && sl && /^tåg\s/i.test(base) ? base.replace(/^tåg/i, 'Pendeltåg') : base;
  return fixed.charAt(0).toUpperCase() + fixed.slice(1);
}

export function parseTrips(raw: unknown): TransitTrip[] {
  const trips = (raw as { Trip?: { LegList?: { Leg?: RawLeg | RawLeg[] } }[] })?.Trip ?? [];
  return trips.flatMap((t) => {
    const legsRaw = t.LegList?.Leg;
    const list = Array.isArray(legsRaw) ? legsRaw : legsRaw ? [legsRaw] : [];
    const legs = list.flatMap((l): TransitLeg[] => {
      if (l.type === 'TRSF') return [];
      const dep = ms(l.Origin), arr = ms(l.Destination);
      const p = Array.isArray(l.Product) ? l.Product[0] : l.Product;
      const walk = l.type === 'WALK';
      const name = p?.name ?? l.name ?? '';
      const kind: LegKind = walk ? 'walk' : kindOf(name);
      const sl = /\(Stockholm kn\)|\(Solna kn\)|\(Huddinge kn\)|\(Sundbyberg kn\)/.test(l.Destination.name);
      return [{
        kind, from: stopName(l.Origin.name), to: stopName(l.Destination.name), dep, arr, minutes: Math.round((arr - dep) / 60_000),
        label: walk ? null : labelOf(name, kind, sl), num: walk ? null : (p?.num ?? null),
        dir: l.direction ? stopName(l.direction) : null, track: l.Origin.rtTrack ?? l.Origin.track ?? null,
      }];
    });
    const o = list[0]?.Origin;
    return legs.length ? [{ dep: legs[0].dep, arr: legs.at(-1)!.arr, legs, startAt: o?.lat != null && o.lon != null ? { lat: o.lat, lon: o.lon } : null }] : [];
  });
}

/**
 * Rensar förslagen: ett per första fordon (snabbast framme) och bort med resor som en annan slår
 * (avgår samtidigt eller senare och är framme samtidigt eller tidigare). Sorterat på avgång.
 */
export function bestTrips(trips: TransitTrip[]): TransitTrip[] {
  const firstRide = (t: TransitTrip) => t.legs.find((l) => l.kind !== 'walk');
  const byRide = new Map<string, TransitTrip>();
  for (const t of trips) {
    const r = firstRide(t);
    const k = r ? `${r.label}@${r.dep}` : `walk@${t.dep}`;
    const prev = byRide.get(k);
    if (!prev || t.arr < prev.arr) byRide.set(k, t);
  }
  const list = [...byRide.values()];
  return list.filter((t) => !list.some((o) => o !== t && o.dep >= t.dep && o.arr <= t.arr && (o.dep > t.dep || o.arr < t.arr)))
    .sort((a, b) => a.dep - b.dep);
}

/** Lägger till promenaden till första hållplatsen (cirka 4,8 km/h, 25 % omväg, 2 min marginal). */
export function withWalk(t: TransitTrip, km: number): TransitTrip {
  const min = Math.max(1, Math.ceil(((km * 1.25) / 4.8) * 60));
  const first = t.legs[0];
  const walk: TransitLeg = { kind: 'walk', from: 'Hemma', to: first.from, dep: first.dep - (min + 2) * 60_000, arr: first.dep - 2 * 60_000, minutes: min, label: null, num: null, dir: null, track: null };
  return { ...t, dep: walk.dep, legs: [walk, ...t.legs] };
}
