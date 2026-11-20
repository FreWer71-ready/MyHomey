// Startpunkt för resa dörr till dörr: mobilens plats först, sedan Life360, annars hemmet.
// Ren logik (testas i startpoint.test.ts); positionerna hämtas i api/journey.
import { km, type LatLon } from './trip.ts';

export type StartSrc = 'phone' | 'life360' | 'home';
export type Start = { at: LatLon; src: StartSrc };
export type Candidate = { at: LatLon | null | undefined; src: 'phone' | 'life360' };

/** Närmare hemmet än så räknas som hemma (GPS-brus). */
export const AT_HOME_KM = 0.15;
/** Längre än så från startområdet går man inte: positionen används inte. */
export const MAX_KM = { toWork: 5, home: 15 } as const;

/** Siffror inom giltigt intervall, annars null. Mobilens noggrannhet över 1 km räknas inte. */
export function parseLatLon(lat: unknown, lon: unknown, acc?: unknown): LatLon | null {
  const a = Number(lat), o = Number(lon);
  if (lat == null || lon == null || lat === '' || lon === '' || !Number.isFinite(a) || !Number.isFinite(o) || Math.abs(a) > 90 || Math.abs(o) > 180) return null;
  if (acc != null && acc !== '' && !(Number(acc) <= 1000)) return null;
  return { lat: a, lon: o };
}

/**
 * Första användbara kandidaten i prioritetsordning (mobil, sedan Life360). Hemma (inom 150 m) ger startpunkten hemmet;
 * annars måste positionen ligga inom MAX_KM från `near` (stationen mot jobbet, jobbet på hemvägen). Null om ingen duger.
 */
export function pickStart(cands: Candidate[], home: LatLon, near: LatLon, toWork: boolean): Start | null {
  for (const c of cands) {
    if (!c.at) continue;
    if (km(c.at, home) <= AT_HOME_KM) return { at: home, src: 'home' };
    if (km(c.at, near) <= MAX_KM[toWork ? 'toWork' : 'home']) return { at: c.at, src: c.src };
  }
  return null;
}
