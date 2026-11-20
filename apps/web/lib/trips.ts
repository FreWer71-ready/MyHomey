// Tågresor jag varit på: statistik (resor, mil, förseningar) och ersättningslista. Ren logik (testas i trips.test.ts);
// hämtning och sparande i trips-source.ts.
import { station } from './commute.ts';

/** Spårvägen Eskilstuna C – Stockholm C i km. */
export const ROUTE_KM = 109;
/** Försenad från och med så här många minuters ankomstförsening. */
export const DELAYED_MIN = 5;
/** Ersättning kan begäras från och med så här många minuters ankomstförsening. */
export const CLAIM_MIN = 20;

export type Claim = 'none' | 'sent' | 'paid' | 'rejected';
export const CLAIMS: Claim[] = ['none', 'sent', 'paid', 'rejected'];
export const CLAIM_LABEL: Record<Claim, string> = { none: 'Ej begärd', sent: 'Begärd', paid: 'Utbetald', rejected: 'Avslagen' };

export type Trip = {
  ident: string; dep: number; arr: number; from: string; to: string; product: string | null; km: number;
  actualArr: number | null; delayMin: number | null; canceled: boolean; settled: boolean; claim: Claim;
};
type Row = {
  ident: string; dep: string; arr: string; from_sig: string; to_sig: string; product: string | null; km: number | string;
  actual_arr: string | null; delay_min: number | null; canceled: boolean; settled: boolean; claim: string;
};
export const fromRow = (r: Row): Trip => ({
  ident: r.ident, dep: Date.parse(r.dep), arr: Date.parse(r.arr), from: r.from_sig, to: r.to_sig, product: r.product, km: Number(r.km),
  actualArr: r.actual_arr ? Date.parse(r.actual_arr) : null, delayMin: r.delay_min, canceled: r.canceled, settled: r.settled,
  claim: (CLAIMS as string[]).includes(r.claim) ? (r.claim as Claim) : 'none',
});

export type Ann = { LocationSignature: string; ActivityType?: string; Canceled?: boolean; AdvertisedTimeAtLocation?: string; TimeAtLocation?: string };

/** Utfallet ur tågets passager: faktisk ankomst vid slutstationen (närmast planerad tid, högst 10 min ifrån) eller inställt. Null om det inte är känt än. */
export function outcome(anns: Ann[], toSig: string, plannedArr: number): { actualArr: number | null; canceled: boolean } | null {
  const diff = (a: Ann) => Math.abs(Date.parse(a.AdvertisedTimeAtLocation ?? '') - plannedArr);
  const a = anns.filter((x) => x.LocationSignature === toSig && x.ActivityType === 'Ankomst' && x.AdvertisedTimeAtLocation && diff(x) <= 10 * 60_000)
    .sort((x, y) => diff(x) - diff(y))[0];
  if (!a) return null;
  if (a.Canceled) return { actualArr: null, canceled: true };
  return a.TimeAtLocation ? { actualArr: Date.parse(a.TimeAtLocation), canceled: false } : null;
}

/** Ankomstförsening i hela minuter (aldrig negativ). */
export const delayOf = (planned: number, actual: number) => Math.max(0, Math.round((actual - planned) / 60_000));

/** Resa att begära ersättning för: försenad {CLAIM_MIN} min eller mer vid ankomst. */
export const claimable = (t: Trip) => !t.canceled && (t.delayMin ?? 0) >= CLAIM_MIN;

export function stats(trips: Trip[]) {
  const ran = trips.filter((t) => !t.canceled);
  const delays = ran.flatMap((t) => (t.delayMin == null ? [] : [t.delayMin]));
  const total = delays.reduce((a, b) => a + b, 0);
  const km = ran.reduce((a, t) => a + t.km, 0);
  return {
    trips: trips.length, canceled: trips.length - ran.length, km, mil: km / 10,
    known: delays.length, avg: delays.length ? total / delays.length : 0, total,
    onTime: delays.filter((d) => d < DELAYED_MIN).length,
    late: delays.filter((d) => d >= DELAYED_MIN && d < CLAIM_MIN).length,
    claimable: delays.filter((d) => d >= CLAIM_MIN).length,
  };
}

const hm = (ms: number) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms);
const ymd = (ms: number) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);

/** Underlag att klistra in i ersättningsformuläret. */
export function claimText(t: Trip): string {
  const rows = [
    `Ersättning för försenat tåg`,
    `Tåg: ${t.product ?? 'Tåg'} ${t.ident}, ${station(t.from)} – ${station(t.to)}`,
    `Datum: ${ymd(t.dep)}`,
    `Planerad avgång: ${hm(t.dep)}, planerad ankomst: ${hm(t.arr)}`,
  ];
  if (t.actualArr != null) rows.push(`Faktisk ankomst: ${hm(t.actualArr)} (${t.delayMin ?? delayOf(t.arr, t.actualArr)} min försenad)`);
  return rows.join('\n');
}
