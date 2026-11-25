'use server';
import { cookies } from 'next/headers';
import { FOCUS_COOKIE, FOCUS_MAX, packFocus, type FocusTrip } from '@/lib/focus-trip';
import type { TransitLeg } from '@/lib/transit';

// Dagens resa (Sök resa → "Välj som dagens resa"): sparas på enheten i kakan focus_trip och gäller resten av dagen.
const opts = { path: '/', sameSite: 'lax' as const, httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 26 * 3600 };

export async function setFocusTrip(legs: TransitLeg[], to: string, home: boolean): Promise<{ ok: boolean; error?: string }> {
  const f: FocusTrip | null = packFocus({ legs }, to, home);
  if (!f) return { ok: false, error: 'Resan kunde inte sparas' };
  const raw = JSON.stringify(f);
  if (raw.length > FOCUS_MAX) return { ok: false, error: 'Resan har för många delar för att sparas' };
  (await cookies()).set(FOCUS_COOKIE, raw, opts);
  return { ok: true };
}

export async function clearFocusTrip(): Promise<{ ok: boolean }> {
  (await cookies()).delete(FOCUS_COOKIE);
  return { ok: true };
}
