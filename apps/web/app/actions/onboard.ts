'use server';
import { createClient } from '@/lib/supabase/server';
import { dropUpcomingTrip, logLeg, logTrip, unlogLeg } from '@/lib/trips-source';
import { km as distKm } from '@/lib/trip';

// "Jag är på tåget": användarens bekräftelse går före gissningen (position/GPS) och gäller på alla skärmar i hushållet
// tills ankomsten + resten av resan (75 min). "Inte på tåget" tar bort den.

type Result = { ok: boolean };

export async function confirmTrain(ident: string, dep: number, arr: number | null): Promise<Result> {
  if (!/^\d{1,6}$/.test(ident) || !Number.isFinite(dep) || (arr != null && !Number.isFinite(arr))) return { ok: false };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false };
  const until = (arr ?? dep + 2 * 3600_000) + 75 * 60_000;
  const { error } = await sb.from('onboard_confirm').upsert(
    { ident, dep: new Date(dep).toISOString(), until: new Date(until).toISOString(), created_by: user.id, created_at: new Date().toISOString() },
    { onConflict: 'household_id' },
  );
  // Resan sparas för statistiken (misslyckas det är bekräftelsen ändå giltig).
  if (!error) await logTrip(ident, dep).catch(() => {});
  return { ok: !error };
}

export async function clearTrain(): Promise<Result> {
  const sb = await createClient();
  // Hann man ångra före avgång tas den sparade resan bort.
  const { data: cur } = await sb.from('onboard_confirm').select('ident,dep').maybeSingle();
  if (cur) await dropUpcomingTrip(cur.ident as string, Date.parse(cur.dep as string)).catch(() => {});
  const { error } = await sb.from('onboard_confirm').delete().neq('ident', '');
  return { ok: !error };
}

/** Dölj en avgång (gäller hushållets alla skärmar). Gamla dolda rensas samtidigt. */
export async function skipTrain(ident: string, dep: number): Promise<Result> {
  if (!/^\d{1,6}$/.test(ident) || !Number.isFinite(dep)) return { ok: false };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false };
  await sb.from('commute_skip').delete().lt('dep', new Date(Date.now() - 86400_000).toISOString());
  const { error } = await sb.from('commute_skip').upsert({ ident, dep: new Date(dep).toISOString(), created_by: user.id }, { onConflict: 'household_id,ident,dep' });
  return { ok: !error };
}

/** Visa alla dolda avgångar igen. */
export async function unskipAll(): Promise<Result> {
  const sb = await createClient();
  const { error } = await sb.from('commute_skip').delete().neq('ident', '');
  return { ok: !error };
}

/**
 * Dagens resa: bekräfta ett tåg (vilket som helst) så att det sparas i tåghistoriken. Sträckan räknas ur hållplatsernas läge
 * (annars 0 km). Bara det användaren själv trycker på sparas.
 */
export async function confirmLeg(leg: { ident: string; dep: number; arr: number; from: string; to: string; label: string | null; fromAt?: { lat: number; lon: number } | null; toAt?: { lat: number; lon: number } | null }): Promise<Result> {
  if (!/^\d{1,6}$/.test(leg.ident) || !Number.isFinite(leg.dep) || !Number.isFinite(leg.arr) || leg.arr <= leg.dep) return { ok: false };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false };
  const d = leg.fromAt && leg.toAt ? Math.round(distKm(leg.fromAt, leg.toAt)) : 0;
  const product = (leg.label ?? '').replace(/\s*\d+\s*$/, '').trim().slice(0, 40) || null;
  return { ok: await logLeg({ ident: leg.ident, dep: leg.dep, arr: leg.arr, from: leg.from.slice(0, 60), to: leg.to.slice(0, 60), product, km: Math.min(2000, Math.max(0, d)) }) };
}

export async function unconfirmLeg(ident: string, dep: number): Promise<Result> {
  if (!/^\d{1,6}$/.test(ident) || !Number.isFinite(dep)) return { ok: false };
  return { ok: await unlogLeg(ident, dep) };
}
