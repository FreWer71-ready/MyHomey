// Kollektivresa (ResRobot v2.1, Trafiklab): gång, buss, tåg, SL. Ren tolkning här; hämtningen i transit-source.ts.
import { zoned } from './calendar.ts';
import { km as dist } from './trip.ts';

export type LegKind = 'walk' | 'train' | 'bus' | 'metro' | 'tram' | 'other';
export type TransitLeg = {
  kind: LegKind; from: string; to: string; dep: number; arr: number; minutes: number;
  /** "Regionaltåg 914", "Pendeltåg 41", "Buss 3"; null för gång. */ label: string | null;
  /** Tåg-/linjenummer (matchas mot Trafikverkets realtid för tåg). */ num: string | null;
  dir: string | null; track: string | null;
  /** Hållplatsernas läge (från ResRobot), för att se var man är under resan. */ fromAt?: { lat: number; lon: number } | null; toAt?: { lat: number; lon: number } | null;
  /** Gångsträckans längd i meter (om känd). */ meters?: number | null;
};
export type TransitTrip = {
  dep: number; arr: number; legs: TransitLeg[];
  /** Första och sista hållplatsens läge. */ startAt: { lat: number; lon: number } | null; endAt: { lat: number; lon: number } | null;
};

type RawStop = { name: string; date: string; time: string; lat?: number; lon?: number; track?: string; rtTrack?: string; rtTime?: string; rtDate?: string };
type RawLeg = { type: string; name?: string; direction?: string; dist?: number; Origin: RawStop; Destination: RawStop; Product?: { name?: string; num?: string; catOutL?: string } | { name?: string; num?: string; catOutL?: string }[] };

const ms = (s: RawStop, rt = true) => {
  const [y, m, d] = (rt && s.rtDate ? s.rtDate : s.date).split('-').map(Number);
  const [h, mi, se] = (rt && s.rtTime ? s.rtTime : s.time).split(':').map(Number);
  return zoned(y, m, d, h, mi, se || 0);
};
const ENTITY: Record<string, string> = { aring: 'å', auml: 'ä', ouml: 'ö', Aring: 'Å', Auml: 'Ä', Ouml: 'Ö', eacute: 'é', Eacute: 'É', egrave: 'è', uuml: 'ü', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
/** ResRobot skickar tillbaka namn vi själva angett (t.ex. "Mål") HTML-kodade: "M&aring;l" → "Mål". */
export const decodeEntities = (s: string) => s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (m, d, h, name) =>
  d ? String.fromCodePoint(Number(d)) : h ? String.fromCodePoint(parseInt(h, 16)) : (ENTITY[name] ?? m));

/** Korta stoppnamn: "Årstaberg station (Stockholm kn)" → "Årstaberg", "Eskilstuna Centralstation" → "Eskilstuna C",
 *  "Fredsborgsgatan 24, Liljeholmen" → "Fredsborgsgatan 24"; koordinater → "Start". HTML-koder avkodas. */
export const stopName = (raw: string) => {
  const n = decodeEntities(raw);
  return /^\s*-?\d+\.\d+,\s*-?\d+\.\d+\s*$/.test(n) ? 'Start'
    : n.replace(/\s*\([^)]*\bkn\)\s*$/, '').split(',')[0].replace(/\s+Centralstation$/i, ' C').replace(/\s+station$/i, '').replace(/\s+Spårv$/i, '').replace(/\s+T-bana$/i, '').trim();
};

/** Gångsträcka i meter (25 % omväg, avrundat till 10 m) och som text: "280 m", "1,2 km". */
export const walkMeters = (km: number) => Math.round((km * 1.25 * 1000) / 10) * 10;
export const fmtMeters = (m: number) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`);

/**
 * Linjebricka som i SL-appen: nummer på linjens färg (tunnelbana röd/grön/blå, Tvärbanan, pendeltåg rosa, buss blå).
 * Null när linjen saknar nummer eller färg (då visas hela namnet, t.ex. "Regionaltåg 914").
 */
export function lineBadge(l: Pick<TransitLeg, 'kind' | 'label' | 'num'>): { text: string; color: string } | null {
  const text = l.label?.match(/(\d+)\s*$/)?.[1] ?? (l.num && /^\d+$/.test(l.num) ? l.num : null);
  if (!text || l.kind === 'walk') return null;
  const n = Number(text);
  if (l.kind === 'metro') return { text, color: n >= 17 ? '#1F7A33' : n >= 13 ? '#C8282A' : '#0B6BAE' };
  if (l.kind === 'tram') return { text, color: n === 30 || n === 31 || n === 21 ? '#9A5B16' : n >= 25 && n <= 26 ? '#0E7F96' : n >= 27 && n <= 29 ? '#7B4A95' : '#5F7388' };
  if (l.kind === 'train') return /^pendeltåg/i.test(l.label ?? '') ? { text, color: '#C93D7B' } : null;
  if (l.kind === 'bus') return { text, color: '#2563A8' };
  return null;
}

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

const at = (s?: RawStop) => (s?.lat != null && s.lon != null ? { lat: s.lat, lon: s.lon } : null);

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
        fromAt: at(l.Origin), toAt: at(l.Destination), ...(walk && typeof l.dist === 'number' ? { meters: Math.round(l.dist) } : {}),
      }];
    });
    const o = list[0]?.Origin, e = list.at(-1)?.Destination;
    return legs.length ? [{ dep: legs[0].dep, arr: legs.at(-1)!.arr, legs, startAt: at(o), endAt: at(e) }] : [];
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

const walkMin = (km: number) => Math.max(1, Math.ceil(((km * 1.25) / 4.8) * 60));

/** Lägger till promenaden från sista hållplatsen till målet (t.ex. hem från Eskilstuna C). `toAt` = målets läge (bekräftar sträckan). */
export function withWalkEnd(t: TransitTrip, km: number, to = 'Hemma', toAt: { lat: number; lon: number } | null = null): TransitTrip {
  const last = t.legs.at(-1)!;
  const min = walkMin(km);
  const walk: TransitLeg = { kind: 'walk', from: last.to, to, dep: last.arr, arr: last.arr + min * 60_000, minutes: min, label: null, num: null, dir: null, track: null, fromAt: last.toAt ?? null, toAt, meters: walkMeters(km) };
  return { ...t, arr: walk.arr, legs: [...t.legs, walk] };
}

/** Lägger till promenaden till första hållplatsen (cirka 4,8 km/h, 25 % omväg, 2 min marginal). */
export function withWalk(t: TransitTrip, km: number): TransitTrip {
  const min = walkMin(km);
  const first = t.legs[0];
  const walk: TransitLeg = { kind: 'walk', from: 'Hemma', to: first.from, dep: first.dep - (min + 2) * 60_000, arr: first.dep - 2 * 60_000, minutes: min, label: null, num: null, dir: null, track: null, toAt: first.fromAt ?? null, meters: walkMeters(km) };
  return { ...t, dep: walk.dep, legs: [walk, ...t.legs] };
}

export type Here = { at: { lat: number; lon: number }; ts: number };

/**
 * Hur långt man kommit i en plan, enligt positionen och inte klockan:
 * `known` = färsk position finns (annars visas ingen markering alls), `done` = antal avklarade sträckor (bekräftade av
 * positionen), `waiting` = planens första avgång har passerat men positionen är kvar vid startpunkten (man har inte gått än).
 */
export type Progress = { known: boolean; done: number; waiting: boolean };
export function progress(legs: TransitLeg[], here: Here | null, start: { lat: number; lon: number } | null, now: number, near = 0.4): Progress {
  if (!here || !legs.length) return { known: false, done: 0, waiting: false };
  const done = doneLegs(legs, here, near).length;
  const waiting = done === 0 && legs[0].dep < now - 60_000 && !!start && dist(start, here.at) <= near;
  return { known: true, done, waiting };
}

/**
 * Avklarade delsträckor i en plan utifrån var man sågs senast: allt till och med den sista sträckan som slutar
 * inom `near` km från positionen. Hann man före planen flyttas sträckans tider bakåt (framme senast när man sågs).
 * Returnerar de avklarade benen (tom lista om positionen inte ligger vid någon hållplats i planen).
 */
export function doneLegs(legs: TransitLeg[], here: Here, near = 0.4): TransitLeg[] {
  let i = -1;
  legs.forEach((l, k) => { if (l.toAt && dist(l.toAt, here.at) <= near) i = k; });
  return legs.slice(0, i + 1).map((l) => {
    if (l.arr <= here.ts) return l;
    const shift = l.arr - here.ts;
    return { ...l, dep: l.dep - shift, arr: here.ts };
  });
}

/** Snabbaste planen (först framme); vid lika den som avgår senast. Null om listan är tom. */
export function fastest(plans: TransitLeg[][]): TransitLeg[] | null {
  return plans.filter((p) => p.length).sort((a, b) => a.at(-1)!.arr - b.at(-1)!.arr || b[0].dep - a[0].dep)[0] ?? null;
}
