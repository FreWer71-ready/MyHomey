// Tågläge: är dashboardens person på ett tåg? Ren logik (testas i onboard.test.ts); hämtningen i onboard-source.ts.
// Position: färskaste av Life360 och Apple Watch (Hitta). Tåg: Trafikverkets GPS-position (TrainPosition).
import type { Item, Member } from './locate.ts';
import { km, type LatLon } from './trip.ts';

export type Pos = { at: LatLon; ts: number; speed: number | null; src: 'life360' | 'watch' };
export type TrainPos = { train: string; at: LatLon; ts: number; speed: number | null };
export type OnTrain = { train: string; dist: number; src: Pos['src'] };

const MAX_AGE = 10 * 60_000;

/** Färskaste positionen (högst 10 min gammal) för personen med förnamnet `first`: Life360 eller personens Apple Watch. */
export function freshestPosition(members: Member[], items: Item[], first: string, now = Date.now(), maxAge = MAX_AGE): Pos | null {
  const f = first.toLowerCase();
  const out: Pos[] = [];
  const m = members.find((x) => x.first.toLowerCase() === f);
  // Åldern räknas från senaste positionsändringen, inte t.ex. ett nytt batterivärde.
  if (m?.lat != null && m.lon != null && m.posUpdated) out.push({ at: { lat: m.lat, lon: m.lon }, ts: Date.parse(m.posUpdated), speed: m.speed, src: 'life360' });
  const w = items.find((x) => /apple watch/i.test(x.name) && x.name.toLowerCase().includes(f));
  if (w?.lat != null && w.lon != null && w.posUpdated) out.push({ at: { lat: w.lat, lon: w.lon }, ts: Date.parse(w.posUpdated), speed: null, src: 'watch' });
  return out.filter((p) => now - p.ts <= maxAge).sort((a, b) => b.ts - a.ts)[0] ?? null;
}

/** "POINT (17.62 59.19)" → { lat, lon }. */
export function parsePoint(wkt: string): LatLon | null {
  const m = wkt?.match(/POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/);
  return m ? { lon: Number(m[1]), lat: Number(m[2]) } : null;
}

/** Ändstationer där många tåg möts (Eskilstuna C, Stockholm C): där avgörs inget tågläge. */
export const TERMINALS: LatLon[] = [{ lat: 59.369482, lon: 16.505193 }, { lat: 59.330136, lon: 18.058151 }];

/**
 * Tåget man sitter på: närmaste tåg inom 500 m som rör sig (över 20 km/h, rapport högst 3 min gammal) och som finns
 * bland `allowed` (tågen i aktuell pendlingsriktning). Är Life360-farten känd och låg (under 20 km/h), eller är man
 * inom 1 km från en ändstation, avgörs inget – där passerar för många tåg.
 */
export function matchTrain(pos: Pos, trains: TrainPos[], now = Date.now(), allowed?: Set<string>): OnTrain | null {
  if (pos.src === 'life360' && pos.speed != null && pos.speed < 20) return null;
  if (TERMINALS.some((t) => km(pos.at, t) <= 1)) return null;
  const hit = trains
    .filter((t) => now - t.ts <= 3 * 60_000 && (t.speed ?? 0) > 20 && (!allowed || allowed.has(t.train)))
    .map((t) => ({ t, d: km(pos.at, t.at) }))
    .filter((x) => x.d <= 0.5)
    .sort((a, b) => a.d - b.d)[0];
  return hit ? { train: hit.t.train, dist: hit.d, src: pos.src } : null;
}

type TrainLike = { ident: string; dep: number; est: number | null; arr: number | null; canceled: boolean };

/**
 * Troligen på tåget, när ingen ny position kommer (telefonen skickar sällan plats under resan): senaste positionen
 * (högst 2 h gammal) låg vid avgångsstationen högst 20 min före en avgång i aktuell riktning, tåget har gått och är
 * inte framme än. Ger tågnumret eller null.
 */
export function inferTrain(pos: Pos | null, station: LatLon, trains: TrainLike[], now = Date.now()): string | null {
  if (!pos || now - pos.ts > 2 * 3600_000 || km(pos.at, station) > 0.6) return null;
  const hit = trains
    .filter((t) => !t.canceled)
    .map((t) => ({ t, d: t.est ?? t.dep }))
    .filter(({ t, d }) => d >= pos.ts - 2 * 60_000 && d <= pos.ts + 20 * 60_000 && d <= now && (t.arr == null || now <= t.arr + 10 * 60_000))
    .sort((a, b) => a.d - b.d)[0];
  return hit?.t.ident ?? null;
}
