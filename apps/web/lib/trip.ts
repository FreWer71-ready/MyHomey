// Helgtrafik: resmål från kalendern (plats på nästa händelse) och vägärenden längs vägen dit eller i närområdet.
// Ren logik utan hämtning; testas i trip.test.ts. Vägen approximeras med en rak korridor hem → mål.
import type { CalDay } from './calendar-view.ts';
import type { RoadEvent } from './commute.ts';

export type LatLon = { lat: number; lon: number };
export type Trip = { title: string; location: string; place: string; start: number | null };

/** Lördag eller söndag i Stockholm. */
export const isWeekend = (now = Date.now()) =>
  ['Sat', 'Sun'].includes(new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Stockholm', weekday: 'short' }).format(now));

/** Ortnamnet ur en adress: "Storgatan 5, 647 30 Mariefred, Sverige" → "Mariefred". */
export function placeLabel(location: string): string {
  const parts = location.split(',').map((p) => p.trim()).filter((p) => p && !/^(sverige|sweden)$/i.test(p));
  const last = (parts.at(-1) ?? location).replace(/^\d{3}\s?\d{2}\s+/, '').replace(/\d+/g, '').trim();
  return last || location.trim();
}

const ONLINE = /https?:|meet\.google|zoom\.us|teams\.microsoft|^online$|^digitalt?$/i;

/** Nästa händelse med en plats (tidsatt inom `hours` timmar, eller heldag idag). Pågående räknas inte (man är redan där). */
export function nextTrip(days: CalDay[], now = Date.now(), hours = 30): Trip | null {
  const all = days.flatMap((d) => [...d.timed, ...d.allDay]);
  const timed = all.filter((e) => e.location && !ONLINE.test(e.location) && e.start != null && e.start >= now - 10 * 60_000 && e.start <= now + hours * 3600_000)
    .sort((a, b) => a.start! - b.start!)[0];
  const allDay = days[0]?.allDay.find((e) => e.location && !ONLINE.test(e.location));
  const e = timed ?? allDay;
  return e?.location ? { title: e.title, location: e.location, place: placeLabel(e.location), start: e.start } : null;
}

/** Avstånd i km (haversine). */
export function km(a: LatLon, b: LatLon): number {
  const r = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Kortaste avstånd (km) från p till sträckan a–b (plan projektion runt a, räcker för några mil). */
export function toSegmentKm(p: LatLon, a: LatLon, b: LatLon): number {
  const kx = 111.32 * Math.cos((a.lat * Math.PI) / 180), ky = 110.57;
  const [px, py, bx, by] = [(p.lon - a.lon) * kx, (p.lat - a.lat) * ky, (b.lon - a.lon) * kx, (b.lat - a.lat) * ky];
  const t = Math.max(0, Math.min(1, (px * bx + py * by) / (bx * bx + by * by || 1)));
  return Math.hypot(px - t * bx, py - t * by);
}

const has = (e: RoadEvent): e is RoadEvent & LatLon => e.lat != null && e.lon != null;

/** Ärenden längs vägen (inom `buffer` km från linjen hem → mål) eller nära målet. */
export const alongRoute = (events: RoadEvent[], home: LatLon, dest: LatLon, buffer = 5, end = 6) =>
  events.filter((e) => has(e) && (toSegmentKm(e, home, dest) <= buffer || km(e, dest) <= end));

/** Ärenden inom `radius` km hemifrån. */
export const nearHome = (events: RoadEvent[], home: LatLon, radius = 20) => events.filter((e) => has(e) && km(e, home) <= radius);

/** Ruta [minLon, minLat, maxLon, maxLat] runt punkterna med marginal i km. */
export function boxFor(points: LatLon[], padKm: number): [number, number, number, number] {
  const lat = points.map((p) => p.lat), lon = points.map((p) => p.lon);
  const dLat = padKm / 110.57, dLon = padKm / (111.32 * Math.cos((Math.min(...lat) * Math.PI) / 180));
  const f = (x: number) => Math.round(x * 100) / 100;
  return [f(Math.min(...lon) - dLon), f(Math.min(...lat) - dLat), f(Math.max(...lon) + dLon), f(Math.max(...lat) + dLat)];
}
