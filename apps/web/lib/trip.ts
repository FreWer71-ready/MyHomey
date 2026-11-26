// Helgtrafik: resmål från kalendern (plats på nästa händelse) och vägärenden längs vägen dit eller i närområdet.
// Ren logik utan hämtning; testas i trip.test.ts. Vägen approximeras med en rak korridor hem → mål.
import type { CalDay } from './calendar-view.ts';
import type { RoadEvent } from './commute.ts';

export type LatLon = { lat: number; lon: number };
export type Trip = { title: string; location: string; place: string; start: number | null };

/** Veckodag (0 = söndag) och timme i Stockholm. */
export function stockholm(now = Date.now()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Stockholm', weekday: 'short', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(now).map((x) => [x.type, x.value]));
  return { day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday), hour: Number(p.hour) };
}

/** Helgläge (ingen tågpendling): fredag 20:00 – söndag 12:00. Söndag eftermiddag visas pendlingen igen inför måndagen. */
export function isWeekend(now = Date.now()) {
  const { day, hour } = stockholm(now);
  return (day === 5 && hour >= 20) || day === 6 || (day === 0 && hour < 12);
}

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

/** Kommande tidsatta händelser inom `hours` timmar (pågående räknas inte), med eller utan plats, i tidsordning. */
export function upcoming(days: CalDay[], now = Date.now(), hours = 8): { title: string; location: string | null; start: number }[] {
  return days.flatMap((d) => d.timed)
    .filter((e) => e.start != null && e.start >= now - 10 * 60_000 && e.start <= now + hours * 3600_000 && !(e.location && ONLINE.test(e.location)))
    .sort((a, b) => a.start! - b.start!)
    .map((e) => ({ title: e.title, location: e.location || null, start: e.start! }));
}

const NOT_PLACE = new Set(['möte', 'möten', 'träning', 'match', 'matcher', 'lunch', 'middag', 'frukost', 'kalas', 'fest', 'samtal',
  'jobbet', 'arbete', 'semester', 'ledig', 'påminnelse', 'tandläkare', 'läkare', 'frisör', 'fotboll', 'innebandy', 'hockey',
  'handboll', 'simning', 'gymnastik', 'konsert', 'resa', 'utvecklingssamtal', 'föräldramöte', 'veckomöte', 'fredagsfika']);

/** Platsnamn att pröva ur en titel: ord (eller ordföljd) med versal, minst 5 bokstäver, utom vanliga ord. */
export function placeCandidates(title: string): string[] {
  const words = title.split(/[\s,·:;/()–—-]+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (!/^[A-ZÅÄÖÉ][\wåäöéü]{4,}$/.test(w) || NOT_PLACE.has(w.toLowerCase())) continue;
    const next = words[i + 1];
    if (next && /^[A-ZÅÄÖÉ][\wåäöéü]{2,}$/.test(next) && !NOT_PLACE.has(next.toLowerCase())) out.push(`${w} ${next}`);
    out.push(w);
  }
  return [...new Set(out)].slice(0, 3);
}

/** Antal ändringar (Levenshtein) mellan två ord, utan hänsyn till versaler. */
export function editDistance(a: string, b: string): number {
  const s = a.toLowerCase(), t = b.toLowerCase();
  let prev = Array.from({ length: t.length + 1 }, (_, j) => j);
  for (let i = 1; i <= s.length; i++) {
    const cur = [i];
    for (let j = 1; j <= t.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[t.length];
}

/** Glesar ut en rutt (TomTom-punkter) till en punkt per `stepKm`, så att jämförelserna går snabbt. */
export function thinPath(points: LatLon[], stepKm = 0.15): LatLon[] {
  const out: LatLon[] = [];
  for (const p of points) if (!out.length || km(out[out.length - 1], p) >= stepKm) out.push(p);
  const last = points[points.length - 1];
  if (last && out[out.length - 1] !== last) out.push(last);
  return out;
}

/** Vägärenden som ligger på den faktiska rutten (inom `buffer` km från någon del av den). */
export const onRoute = (events: RoadEvent[], path: LatLon[], buffer = 0.25) =>
  path.length < 2 ? [] : events.filter((e) => has(e) && path.some((p, i) => i > 0 && toSegmentKm(e, path[i - 1], p) <= buffer));

/** Träff från platssökningen (Nominatim). Naturplatser (holmar, sjöar, berg) duger inte som resmål. */
export type GeoHit = { lat: string; lon: string; category?: string; type?: string };
const NATURE = /^(islet|island|archipelago|bay|lake|water|peak|cape|wetland|wood|forest|strait)$/;
export const usableHit = (h: GeoHit | undefined): h is GeoHit =>
  !!h && h.category !== 'natural' && h.category !== 'waterway' && h.category !== 'water' && !NATURE.test(h.type ?? '');
