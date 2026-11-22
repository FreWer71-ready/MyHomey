import 'server-only';
import { bestTrips, parseTrips, withWalk, withWalkEnd, type TransitLeg, type TransitTrip } from './transit.ts';
import { km, type LatLon } from './trip.ts';
import type { Start } from './startpoint.ts';

// Hämtar kollektivresor från ResRobot (RESROBOT_API_KEY). Mål: TRANSIT_DESTINATION ("lat,lon"), rubrik TRANSIT_DESTINATION_LABEL.
// Hemifrån: från hållplatsen TRANSIT_ORIGIN_STOP (t.ex. 740000170 = Eskilstuna C) med promenad dit. Trafikslag i
// TRANSIT_PRODUCTS (ResRobots bitmask, standard 118 = tåg, pendeltåg, tunnelbana och spårvagn, utan buss).
// Föredragen väg (valfri): via TRANSIT_VIA (t.ex. 740000001 = Stockholm C) till bytespunkten TRANSIT_TRANSFER
// som "id|lat,lon|namn" (t.ex. 740004046|59.311187,18.024702|Liljeholmen); sista biten gång eller spårvagn,
// det som är framme först. Hem i omvänd ordning.
// Nyckeln får aldrig hamna i loggar eller svar.

export const transitConfigured = () => !!process.env.RESROBOT_API_KEY && !!transitGoal();
/** Sök resa (kollektivt) behöver bara ResRobot-nyckeln; målet kan vara hem, jobbets adress eller valfri plats. */
export const transitSearchable = () => !!process.env.RESROBOT_API_KEY;

export function transitGoal(): { label: string; at: LatLon } | null {
  const c = process.env.TRANSIT_DESTINATION?.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  return c ? { label: process.env.TRANSIT_DESTINATION_LABEL || 'Jobbet', at: { lat: Number(c[1]), lon: Number(c[2]) } } : null;
}

type Point = { id: string } | { at: LatLon };
type Transfer = { id: string; at: LatLon; name: string };

/** Bytespunkten ur TRANSIT_TRANSFER ("id|lat,lon|namn"), eller null. */
function transfer(): Transfer | null {
  const [id, ll, name] = (process.env.TRANSIT_TRANSFER ?? '').split('|');
  const c = ll?.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  return id && c ? { id: id.trim(), at: { lat: Number(c[1]), lon: Number(c[2]) }, name: name?.trim() || 'Bytet' } : null;
}
const SPÅRVAGN = '64';
const MIN = 60_000;

/** En sökning i ResRobot från tiden `at` (avrundad till minut, cachas 2 min). [] vid fel. */
async function query(from: Point, to: Point, at: number, opts: { products?: string; via?: string; n?: number; arrival?: boolean } = {}): Promise<TransitTrip[]> {
  const key = process.env.RESROBOT_API_KEY;
  if (!key) return [];
  const p = Object.fromEntries(new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(Math.floor(at / MIN) * MIN).map((x) => [x.type, x.value]));
  const q = new URLSearchParams({
    format: 'json', accessId: key, numF: String(opts.n ?? 4), passlist: '0',
    date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`,
    ...('id' in from ? { originId: from.id } : { originCoordLat: from.at.lat.toFixed(5), originCoordLong: from.at.lon.toFixed(5) }),
    ...('id' in to ? { destId: to.id } : { destCoordLat: to.at.lat.toFixed(5), destCoordLong: to.at.lon.toFixed(5) }),
    ...(opts.products ? { products: opts.products } : {}),
    ...(opts.via ? { viaId: opts.via } : {}),
    ...(opts.arrival ? { searchForArrival: '1' } : {}),
  });
  const res = await fetch(`https://api.resrobot.se/v2.1/trip?${q}`, { next: { revalidate: 120 }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) { console.error(`ResRobot: status ${res.status}`); return []; }
  return parseTrips(await res.json());
}

const walkMin = (d: number) => Math.max(1, Math.ceil(((d * 1.25) / 4.8) * 60));
const walkLeg = (from: string, to: string, dep: number, min: number): TransitLeg =>
  ({ kind: 'walk', from, to, dep, arr: dep + min * MIN, minutes: min, label: null, num: null, dir: null, track: null });

/**
 * Sista/första biten mellan bytespunkten och målet: spårvagn (med gång) eller bara gång, det som är framme först.
 * `out`: från bytespunkten (ankomst `at`) till målet; annars från målet (avgång tidigast `at`) till bytespunkten.
 */
async function lastMile(tr: Transfer, goal: LatLon, at: number, out: boolean): Promise<TransitLeg[]> {
  const walk = walkMin(km(tr.at, goal));
  const tram = (await query(out ? { id: tr.id } : { at: goal }, out ? { at: goal } : { id: tr.id }, at + (out ? 2 * MIN : 0), { products: SPÅRVAGN, n: 2 }))
    .filter((t) => t.legs.some((l) => l.kind === 'tram'))[0];
  const walkArr = at + walk * MIN;
  if (tram && tram.arr < walkArr) return tram.legs;
  return [out ? walkLeg(tr.name, 'Jobbet', at, walk) : walkLeg('Jobbet', tr.name, at, walk)];
}

/** Föredragen väg till jobbet: (gång +) tåg via TRANSIT_VIA till TRANSIT_TRANSFER, sedan gång eller spårvagn. */
async function preferredOut(tr: Transfer, from: LatLon, goal: LatLon, at: number, n: number, home: boolean): Promise<TransitTrip[]> {
  const stop = home ? process.env.TRANSIT_ORIGIN_STOP : undefined;
  const trips = bestTrips(await query(stop ? { id: stop } : { at: from }, { id: tr.id }, at,
    { products: process.env.TRANSIT_PRODUCTS ?? '118', via: process.env.TRANSIT_VIA }))
    .map((t) => (stop && t.startAt ? withWalk(t, km(from, t.startAt)) : t))
    .filter((t) => t.dep >= at - 2 * MIN).slice(0, n);
  return Promise.all(trips.map(async (t) => {
    const tail = await lastMile(tr, goal, t.arr, true);
    return { ...t, arr: tail.at(-1)!.arr, legs: [...t.legs, ...tail], endAt: goal };
  }));
}

/** Föredragen väg hem: gång eller spårvagn till TRANSIT_TRANSFER, tunnelbana + tåg via TRANSIT_VIA, promenad hem. */
async function preferredHome(tr: Transfer, goal: LatLon, home: LatLon, at: number, n: number): Promise<TransitTrip[]> {
  const head = await lastMile(tr, goal, at, false);
  const reach = head.at(-1)!.arr;
  const trips = bestTrips(await query({ id: tr.id }, { id: process.env.TRANSIT_ORIGIN_STOP! }, reach + 2 * MIN,
    { products: process.env.TRANSIT_PRODUCTS ?? '118', via: process.env.TRANSIT_VIA })).slice(0, n);
  return trips.map((t, i) => {
    // Senare alternativ: samma första bit, men man går så att man hinner precis (avgång flyttas fram).
    const shift = i === 0 ? 0 : Math.max(0, t.dep - 2 * MIN - reach);
    const legs = head.map((l) => ({ ...l, dep: l.dep + shift, arr: l.arr + shift }));
    const full = { ...t, dep: legs[0].dep, legs: [...legs, ...t.legs], startAt: goal };
    return full.endAt ? withWalkEnd(full, km(full.endAt, home)) : full;
  });
}

/**
 * De närmaste resorna med avresa från `at`, eller [] vid fel.
 * `home`: hemifrån via TRANSIT_ORIGIN_STOP (om satt) med promenad dit; `toHome`: dit med promenad hem efteråt.
 * Med TRANSIT_VIA och TRANSIT_TRANSFER används den föredragna vägen (jobbet ↔ hemmet).
 */
export async function loadTransit(from: LatLon, to: LatLon, at = Date.now(), n = 2, home = false, toHome = false, arrive = false): Promise<TransitTrip[]> {
  if (!process.env.RESROBOT_API_KEY) return [];
  const goal = transitGoal()?.at;
  const tr = process.env.TRANSIT_VIA ? transfer() : null;
  try {
    // Ankomsttid: vanlig sökning bakåt från ankomsten (föredragen väg räknas framåt).
    if (!arrive && tr && goal && !toHome && km(to, goal) < 0.2) return await preferredOut(tr, from, to, at, n, home);
    if (!arrive && tr && goal && toHome && process.env.TRANSIT_ORIGIN_STOP && km(from, goal) < 1) return await preferredHome(tr, goal, to, at, n);
    // Övrigt (t.ex. från en annan plats): snabbaste vägen, utan buss.
    const stop = home ? process.env.TRANSIT_ORIGIN_STOP : undefined;
    const endStop = toHome ? process.env.TRANSIT_ORIGIN_STOP : undefined;
    const f: Point = stop ? { id: stop } : { at: from }, t: Point = endStop ? { id: endStop } : { at: to };
    let trips = await query(f, t, at, { products: process.env.TRANSIT_PRODUCTS ?? '118', n: n + 2, arrival: arrive });
    if (stop) trips = trips.map((x) => (x.startAt ? withWalk(x, km(from, x.startAt)) : x));
    if (endStop) trips = trips.map((x) => (x.endAt ? withWalkEnd(x, km(x.endAt, to)) : x));
    if (arrive) return trips.filter((x) => x.arr <= at + MIN).sort((a, b) => b.arr - a.arr || b.dep - a.dep).slice(0, n).reverse();
    return bestTrips(trips).filter((x) => x.dep >= at - 2 * MIN).slice(0, n);
  } catch (e) {
    console.error(`ResRobot: ${(e as Error)?.name ?? 'fel'}`);
    return [];
  }
}

/**
 * Resten av resan efter tåget (tågläget): mot jobbet från TRANSIT_VIA (Stockholm C) via bytespunkten och sista biten;
 * hem från TRANSIT_ORIGIN_STOP (Eskilstuna C) till hemmet. `arr` = tågets beräknade ankomst. [] om inget hittas.
 */
export async function loadOnward(arr: number, toWork: boolean, home: LatLon): Promise<TransitLeg[]> {
  try {
    const goal = transitGoal()?.at;
    const tr = transfer();
    if (toWork) {
      if (!goal || !tr || !process.env.TRANSIT_VIA) return [];
      const first = bestTrips(await query({ id: process.env.TRANSIT_VIA }, { id: tr.id }, arr + 3 * MIN, { products: process.env.TRANSIT_PRODUCTS ?? '118', n: 2 }))[0];
      if (!first) return [];
      return [...first.legs, ...(await lastMile(tr, goal, first.arr, true))];
    }
    // Hem från Eskilstuna C: promenad (buss sparar ingen tid och är inte aktuell), samma som dörr till dörr.
    if (!process.env.TRANSIT_ORIGIN_STOP) return [];
    return [walkLeg('Eskilstuna C', 'Hemma', arr, walkMin(km(STATION_ET, home)))];
  } catch (e) {
    console.error(`ResRobot: ${(e as Error)?.name ?? 'fel'}`);
    return [];
  }
}

/** Tågets ben (Eskilstuna C ↔ Stockholm C) i samma form som ResRobots. */
export type JourneyTrain = { ident: string; dep: number; arr: number | null; track: string | null; product: string | null; dest: string; delay: number; canceled: boolean };

const STATION_ET: LatLon = { lat: 59.369482, lon: 16.505193 };

/**
 * Resa dörr till dörr runt ett visst tåg (Pendling och Hem). Mot jobbet: promenad hemifrån till Eskilstuna C, tåget,
 * sedan via bytespunkten till jobbet. Hem: från jobbet via bytespunkten till Stockholm C i tid till tåget, tåget,
 * promenad hem. `leave` = när man behöver gå. Null om något saknas.
 * `start`: var man är nu (mobilen, annars Life360); utan den räknas resan hemifrån (mot jobbet) och från jobbet (hem).
 */
export async function journeyFor(t: JourneyTrain, toWork: boolean, home: LatLon, start?: Start | null): Promise<{ legs: TransitLeg[]; leave: number; arrive: number; start: Start['src'] } | null> {
  const goal = transitGoal()?.at;
  const tr = transfer();
  const via = process.env.TRANSIT_VIA;
  if (!goal || !tr || !via || t.arr == null) return null;
  const dep = t.dep + t.delay * MIN, arr = t.arr + t.delay * MIN;
  const train: TransitLeg = {
    kind: 'train', from: toWork ? 'Eskilstuna C' : 'Stockholm C', to: toWork ? 'Stockholm C' : 'Eskilstuna C',
    dep, arr, minutes: Math.round((arr - dep) / MIN), label: `${t.product ?? 'Tåg'} ${t.ident}`, num: t.ident, dir: t.dest, track: t.track,
  };
  try {
    if (toWork) {
      const from = start ?? { at: home, src: 'home' as const };
      const walk = walkMin(km(from.at, STATION_ET));
      const before = walkLeg(from.src === 'home' ? 'Hemma' : 'Din plats', 'Eskilstuna C', dep - (walk + 2) * MIN, walk);
      const after = (await query({ id: via }, { at: goal }, arr + 3 * MIN, { via: tr.id, products: process.env.TRANSIT_PRODUCTS ?? '118', n: 2 }))
        .sort((a, b) => a.arr - b.arr)[0];
      const legs = [before, train, ...(after?.legs ?? [])];
      return { legs, leave: before.dep, arrive: legs.at(-1)!.arr, start: from.src };
    }
    // Är man någon annanstans än på jobbet räknas hemresan därifrån.
    const origin: Point = start && start.src !== 'home' ? { at: start.at } : { at: goal };
    const before = (await query(origin, { id: via }, dep - 4 * MIN, { via: tr.id, products: process.env.TRANSIT_PRODUCTS ?? '118', n: 2, arrival: true }))
      .filter((x) => x.arr <= dep - 2 * MIN).sort((a, b) => b.dep - a.dep)[0];
    const walk = walkMin(km(STATION_ET, home));
    const after = walkLeg('Eskilstuna C', 'Hemma', arr, walk);
    const legs = [...(before?.legs ?? []), train, after];
    return { legs, leave: legs[0].dep, arrive: after.arr, start: start?.src ?? 'home' };
  } catch (e) {
    console.error(`ResRobot: ${(e as Error)?.name ?? 'fel'}`);
    return null;
  }
}

/** Promenaden hem från Eskilstuna C i minuter (för "hemma hh:mm" på hemtågen). Bara med TRANSIT_ORIGIN_STOP. */
export const homeWalkMin = (home: LatLon) => (process.env.TRANSIT_ORIGIN_STOP ? walkMin(km(home, STATION_ET)) : null);
