'use server';
import { createClient } from '@/lib/supabase/server';
import { dropUpcomingTrip, logTrip } from '@/lib/trips-source';

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
