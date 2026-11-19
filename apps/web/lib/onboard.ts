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
  return allPositions(members, items, first, now, maxAge)[0] ?? null;
}

/** Alla positioner (Life360 och Apple Watch) för personen, högst `maxAge` gamla, nyast först. */
export function allPositions(members: Member[], items: Item[], first: string, now = Date.now(), maxAge = MAX_AGE): Pos[] {
  const f = first.toLowerCase();
  const out: Pos[] = [];
  const m = members.find((x) => x.first.toLowerCase() === f);
  // Åldern räknas från senaste positionsändringen, inte t.ex. ett nytt batterivärde.
  if (m?.lat != null && m.lon != null && m.posUpdated) out.push({ at: { lat: m.lat, lon: m.lon }, ts: Date.parse(m.posUpdated), speed: m.speed, src: 'life360' });
  const w = items.find((x) => /apple watch/i.test(x.name) && x.name.toLowerCase().includes(f));
  if (w?.lat != null && w.lon != null && w.posUpdated) out.push({ at: { lat: w.lat, lon: w.lon }, ts: Date.parse(w.posUpdated), speed: null, src: 'watch' });
  return out.filter((p) => now - p.ts <= maxAge).sort((a, b) => b.ts - a.ts);
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
/** Hur länge efter tågets ankomst resan kan pågå (byte och sista biten till jobbet/hem). */
export const ONWARD_MAX = 75 * 60_000;

export function inferTrain(positions: Pos[], station: LatLon, trains: TrainLike[], now = Date.now()): string | null {
  const recent = positions.filter((p) => now - p.ts <= 2 * 3600_000);
  const latest = [...recent].sort((a, b) => b.ts - a.ts)[0];
  // Den nyaste positionen ska vara vid stationen, eller långt därifrån (man har åkt tåget och är på väg vidare).
  if (!latest || (km(latest.at, station) > 0.6 && km(latest.at, station) < 30)) return null;
  // Står positionen kvar vid stationen vet vi inget efter ankomsten; har man åkt följs resan vidare.
  const after = km(latest.at, station) <= 0.6 ? 10 * 60_000 : ONWARD_MAX;
  // Tidigaste observationen vid stationen (av alla källor): klockan kan rapportera några minuter efter avgång.
  const first = Math.min(...recent.filter((p) => km(p.at, station) <= 0.6).map((p) => p.ts));
  const hit = trains
    .filter((t) => !t.canceled)
    .map((t) => ({ t, d: t.est ?? t.dep }))
    .filter(({ t, d }) => d >= first - 3 * 60_000 && d <= first + 20 * 60_000 && d <= now && (t.arr == null || now <= t.arr + after))
    .sort((a, b) => a.d - b.d)[0];
  return hit?.t.ident ?? null;
}

/**
 * Rätt tur av ett tågnummer (samma nummer går varje dag): den som har avgått och inte är framme, annars den vars
 * avgång ligger närmast nu.
 */
export function pickRun<T extends TrainLike>(list: T[], ident: string, now = Date.now()): T | null {
  const runs = list.filter((t) => t.ident === ident);
  const ongoing = runs.find((t) => (t.est ?? t.dep) <= now && (t.arr == null || now <= t.arr + ONWARD_MAX));
  return ongoing ?? runs.sort((a, b) => Math.abs((a.est ?? a.dep) - now) - Math.abs((b.est ?? b.dep) - now))[0] ?? null;
}

/** Personens positionsenheter: Life360 och egna Apple-prylar (klocka, AirPods) med förnamnet i namnet. */
export function positionDevices(members: Member[], items: Item[], first: string): { id: string; src: Pos['src'] }[] {
  const f = first.toLowerCase();
  const m = members.find((x) => x.first.toLowerCase() === f);
  return [
    ...(m ? [{ id: m.id, src: 'life360' as const }] : []),
    ...items.filter((x) => /apple watch|airpods/i.test(x.name) && x.name.toLowerCase().includes(f)).map((x) => ({ id: x.id, src: 'watch' as const })),
  ];
}

type Reading = { device_id: string; capability_id: string; ts: string; value: number };
/** Ihopparade latitud/longitud-mätningar (samma enhet, högst 90 s isär) till positioner. */
export function pairReadings(rows: Reading[], devices: { id: string; src: Pos['src'] }[]): Pos[] {
  const out: Pos[] = [];
  for (const d of devices) {
    const mine = rows.filter((r) => r.device_id === d.id);
    const lons = mine.filter((r) => r.capability_id.endsWith('longitude')).map((r) => ({ ts: Date.parse(r.ts), v: r.value }));
    for (const r of mine.filter((x) => x.capability_id.endsWith('latitude'))) {
      const ts = Date.parse(r.ts);
      const lon = lons.filter((l) => Math.abs(l.ts - ts) <= 90_000).sort((a, b) => Math.abs(a.ts - ts) - Math.abs(b.ts - ts))[0];
      if (lon) out.push({ at: { lat: r.value, lon: lon.v }, ts, speed: null, src: d.src });
    }
  }
  return out;
}

/**
 * Tidigast man kan vara på stationen härifrån med snabbaste sättet (taxi/cykel): 5 min (komma iväg, till perrongen) + vägen (≈ 1,4 × fågelvägen)
 * i 30 km/h. Null utan position. Tåg som går före det hinner man inte – planen håller inte.
 */
export function earliestAt(pos: Pos | null, station: LatLon, now = Date.now()): number | null {
  if (!pos) return null;
  const d = km(pos.at, station);
  return d < 0.3 ? now : now + (5 + d * 1.4 * 2) * 60_000;
}
