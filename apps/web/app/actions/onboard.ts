'use server';
import { createClient } from '@/lib/supabase/server';

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
  return { ok: !error };
}

export async function clearTrain(): Promise<Result> {
  const sb = await createClient();
  const { error } = await sb.from('onboard_confirm').delete().neq('ident', '');
  return { ok: !error };
}
