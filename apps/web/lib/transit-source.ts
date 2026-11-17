import 'server-only';
import { bestTrips, parseTrips, withWalk, type TransitTrip } from './transit';
import { km } from './trip';
import type { LatLon } from './trip';

// Hämtar kollektivresor från ResRobot (RESROBOT_API_KEY). Mål: TRANSIT_DESTINATION ("lat,lon"), rubrik TRANSIT_DESTINATION_LABEL.
// Hemifrån: från hållplatsen TRANSIT_ORIGIN_STOP (t.ex. 740000170 = Eskilstuna C) med promenad dit. Trafikslag i
// TRANSIT_PRODUCTS (ResRobots bitmask, standard 118 = tåg, pendeltåg, tunnelbana och spårvagn, utan buss).
// Nyckeln får aldrig hamna i loggar eller svar.

export const transitConfigured = () => !!process.env.RESROBOT_API_KEY && !!transitGoal();

export function transitGoal(): { label: string; at: LatLon } | null {
  const c = process.env.TRANSIT_DESTINATION?.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  return c ? { label: process.env.TRANSIT_DESTINATION_LABEL || 'Jobbet', at: { lat: Number(c[1]), lon: Number(c[2]) } } : null;
}

/**
 * De närmaste resorna med avresa från `at` (avrundat till 5 min för cachen), eller [] vid fel.
 * `home`: hemifrån via TRANSIT_ORIGIN_STOP (om satt); annars från positionen `from`.
 */
export async function loadTransit(from: LatLon, to: LatLon, at = Date.now(), n = 2, home = false): Promise<TransitTrip[]> {
  const key = process.env.RESROBOT_API_KEY;
  if (!key) return [];
  const t = Math.floor(at / 300_000) * 300_000;
  const p = Object.fromEntries(new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(t).map((x) => [x.type, x.value]));
  const stop = home ? process.env.TRANSIT_ORIGIN_STOP : undefined;
  const base = {
    format: 'json', accessId: key, numF: String(n + 2), passlist: '0',
    destCoordLat: to.lat.toFixed(5), destCoordLong: to.lon.toFixed(5),
    date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`,
    ...(stop ? { originId: stop } : { originCoordLat: from.lat.toFixed(5), originCoordLong: from.lon.toFixed(5) }),
  };
  const get = async (products?: string) => {
    const q = new URLSearchParams({ ...base, ...(products ? { products } : {}) });
    const res = await fetch(`https://api.resrobot.se/v2.1/trip?${q}`, { next: { revalidate: 120 }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) { console.error(`ResRobot: status ${res.status}`); return []; }
    return parseTrips(await res.json());
  };
  try {
    // Utan buss först; saknas hållplatser för de trafikslagen nära startpunkten, alla trafikslag.
    let trips = await get(process.env.TRANSIT_PRODUCTS ?? '118');
    if (!trips.length) trips = await get();
    if (stop) trips = trips.map((t) => (t.startAt ? withWalk(t, km(from, t.startAt)) : t));
    return bestTrips(trips).filter((t) => t.dep >= at - 2 * 60_000).slice(0, n);
  } catch (e) {
    console.error(`ResRobot: ${(e as Error)?.name ?? 'fel'}`);
    return [];
  }
}
