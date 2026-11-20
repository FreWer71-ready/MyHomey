'use server';
import { createClient } from '@/lib/supabase/server';
import { CLAIMS, type Claim } from '@/lib/trips';

// Tågresor: ersättningsstatus och borttagning (gäller hushållet).
type Result = { ok: boolean };

export async function setClaim(ident: string, dep: number, claim: Claim): Promise<Result> {
  if (!/^\d{1,6}$/.test(ident) || !Number.isFinite(dep) || !CLAIMS.includes(claim)) return { ok: false };
  const sb = await createClient();
  const { error } = await sb.from('train_trips').update({ claim }).eq('ident', ident).eq('dep', new Date(dep).toISOString());
  return { ok: !error };
}

export async function deleteTrip(ident: string, dep: number): Promise<Result> {
  if (!/^\d{1,6}$/.test(ident) || !Number.isFinite(dep)) return { ok: false };
  const sb = await createClient();
  const { error } = await sb.from('train_trips').delete().eq('ident', ident).eq('dep', new Date(dep).toISOString());
  return { ok: !error };
}
