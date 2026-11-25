// Dagens resa: en resa ur Sök resa som användaren valt. Den ersätter pendlingsförslagen på Hem och Pendling resten av
// dagen (kakan focus_trip på enheten). Ren logik, klientsäker (inga värden ur transit.ts).
import type { TransitLeg, TransitTrip } from './transit.ts';

export type FocusTrip = { day: string; to: string; home: boolean; dep: number; arr: number; legs: TransitLeg[] };

export const FOCUS_COOKIE = 'focus_trip';
/** Kakor får vara högst ~4 kB; planer längre än så sparas inte. */
export const FOCUS_MAX = 3800;

/** Datumet i Stockholm ("2026-11-25"). */
export const stockholmDay = (ms: number) =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);

const LL = (p: unknown) => {
  const x = p as { lat?: unknown; lon?: unknown } | null | undefined;
  return x && typeof x.lat === 'number' && typeof x.lon === 'number' ? { lat: +x.lat.toFixed(5), lon: +x.lon.toFixed(5) } : null;
};
const KINDS = new Set(['walk', 'train', 'bus', 'metro', 'tram', 'other']);
const str = (v: unknown, max = 60) => (typeof v === 'string' ? v.slice(0, max) : null);

/** Bara det som behövs för att visa resan (kortare kaka). Null om benet är ogiltigt. */
function leg(l: unknown): TransitLeg | null {
  const x = l as Record<string, unknown>;
  if (!x || !KINDS.has(x.kind as string) || typeof x.dep !== 'number' || typeof x.arr !== 'number' || x.arr < x.dep) return null;
  return {
    kind: x.kind as TransitLeg['kind'], from: str(x.from) ?? '', to: str(x.to) ?? '', dep: x.dep, arr: x.arr,
    minutes: Math.round((x.arr - x.dep) / 60_000), label: str(x.label), num: str(x.num, 12), dir: str(x.dir), track: str(x.track, 8),
    ...(typeof x.meters === 'number' ? { meters: Math.round(x.meters) } : {}),
    ...(LL(x.toAt) ? { toAt: LL(x.toAt) } : {}),
  };
}

/** Resan som ska sparas: dagen den startar, målets namn och benen. Null om resan är ogiltig. */
export function packFocus(trip: Pick<TransitTrip, 'legs'>, to: string, home: boolean): FocusTrip | null {
  const legs = (trip.legs ?? []).map(leg);
  if (!legs.length || legs.length > 12 || legs.some((l) => !l)) return null;
  const ok = legs as TransitLeg[];
  return { day: stockholmDay(ok[0].dep), to: to.slice(0, 40), home, dep: ok[0].dep, arr: ok.at(-1)!.arr, legs: ok };
}

/** Kakans resa om den gäller idag (annars null: gårdagens val försvinner av sig själv). */
export function parseFocus(raw: string | undefined | null, now: number): FocusTrip | null {
  if (!raw) return null;
  try {
    const x = JSON.parse(raw) as FocusTrip;
    const f = packFocus({ legs: x.legs }, typeof x.to === 'string' ? x.to : 'Resan', !!x.home);
    return f && f.day === stockholmDay(now) ? f : null;
  } catch { return null; }
}
