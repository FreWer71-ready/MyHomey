import 'server-only';
import { createClient } from './supabase/server';
import { loadCommute } from './data';
import { ROUTE_KM, delayOf, fromRow, outcome, type Ann, type Trip, isMovingo, type Ticket, type TripSource } from './trips.ts';

// Sparar tåg man varit på (vid "Jag är på tåget") och fyller i faktisk ankomst efteråt. Allt går via användarens
// inloggning och hushållets RLS. Trafikverket ger ankomsttider bara ett par timmar bakåt, så resor fylls i
// när pendlings- eller historiksidan öppnas inom {GIVE_UP} efter ankomst; därefter räknas förseningen som okänd.

const GIVE_UP = 7 * 3600_000;
const iso = (ms: number) => new Date(ms).toISOString();

/** Sparar resan för ett bekräftat tåg (riktning och planerad ankomst ur pendlingens avgångar). Gör inget om tåget inte hittas. */
export async function logTrip(ident: string, dep: number): Promise<void> {
  const c = await loadCommute().catch(() => null);
  if (!c) return;
  const pool = (list: typeof c.out) => list.find((t) => t.ident === ident && Math.abs(t.dep - dep) < 30 * 60_000 && t.arr != null);
  const out = pool([...c.out, ...(c.recent?.out ?? [])]);
  const home = out ? undefined : pool([...c.home, ...(c.recent?.home ?? [])]);
  const t = out ?? home;
  if (!t) return;
  const sb = await createClient();
  await sb.from('train_trips').upsert(
    // Bekräftat av användaren: blir "user" och visas igen även om den tagits bort tidigare.
    { ident, dep: iso(dep), arr: iso(t.arr!), from_sig: out ? 'Et' : 'Cst', to_sig: out ? 'Cst' : 'Et', product: t.product, km: ROUTE_KM, source: 'user', hidden: false },
    { onConflict: 'household_id,ident,dep' },
  );
}

/** Tar bort en resa som inte har avgått (man tryckte "Inte på tåget" i tid). */
export async function dropUpcomingTrip(ident: string, dep: number, now = Date.now()): Promise<void> {
  const sb = await createClient();
  await sb.from('train_trips').delete().eq('ident', ident).eq('dep', iso(dep)).gt('dep', iso(now));
}

/** Fyller i faktisk ankomst för avslutade resor (högst 10 åt gången). Fel ignoreras; nästa sidvisning försöker igen. */
export async function settleTrips(now = Date.now()): Promise<void> {
  try {
    const sb = await createClient();
    const { data } = await sb.from('train_trips').select('ident,dep,arr,to_sig').eq('settled', false).lt('arr', iso(now - 2 * 60_000)).limit(10);
    for (const r of data ?? []) {
      const arr = Date.parse(r.arr as string);
      const { data: d } = await sb.functions.invoke('trafik', { body: { train: r.ident } });
      const o = outcome((d?.announcements ?? []) as Ann[], r.to_sig as string, arr);
      const patch = o ? { settled: true, canceled: o.canceled, actual_arr: o.actualArr ? iso(o.actualArr) : null, delay_min: o.actualArr ? delayOf(arr, o.actualArr) : null }
        : now - arr > GIVE_UP ? { settled: true } : null;
      if (patch) await sb.from('train_trips').update(patch).eq('ident', r.ident).eq('dep', r.dep);
    }
  } catch {
    // Tomt: resorna visas som de är.
  }
}

/** Alla sparade resor, nyast först (efter att färdiga resor fyllts i). */
export async function loadTrips(): Promise<Trip[]> {
  await settleTrips();
  try {
    const sb = await createClient();
    const { data } = await sb.from('train_trips').select('*').eq('hidden', false).order('dep', { ascending: false }).limit(2000);
    return (data ?? []).map((r) => fromRow(r as never));
  } catch {
    return [];
  }
}

/** Pendlarbiljetten: MOVINGO_TYPE (5/30, 30, 90, år; standard 30) och MOVINGO_PRICE (kr, valfritt). */
export const ticket = (): Ticket => ({
  type: isMovingo(process.env.MOVINGO_TYPE) ? process.env.MOVINGO_TYPE : '30',
  price: Number(process.env.MOVINGO_PRICE) > 0 ? Number(process.env.MOVINGO_PRICE) : null,
});

/**
 * Sparar resan när tågläget hittat tåget (tågets GPS eller gissat ur positionen). Finns resan redan – även bortagen
 * ("fel tåg") – ändras inget, så en borttagen gissning kommer inte tillbaka.
 */
export async function saveTrip(t: { ident: string; dep: number; arr: number | null; product: string | null }, toWork: boolean, source: TripSource): Promise<void> {
  if (t.arr == null) return;
  try {
    const sb = await createClient();
    await sb.from('train_trips').upsert(
      { ident: t.ident, dep: iso(t.dep), arr: iso(t.arr), from_sig: toWork ? 'Et' : 'Cst', to_sig: toWork ? 'Cst' : 'Et', product: t.product, km: ROUTE_KM, source },
      { onConflict: 'household_id,ident,dep', ignoreDuplicates: true },
    );
  } catch { /* nästa sidvisning försöker igen */ }
}
