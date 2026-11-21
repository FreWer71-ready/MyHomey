'use server';
import { cookies } from 'next/headers';

// Hur långt före en viss kalenderhändelse man vill vara framme – per händelse (inte nytt standardvärde),
// sparat på enheten i kakan trip_margins: { "<start>|<titel>": minuter }. Passerade händelser rensas.
const TRIP_MARGINS = [0, 5, 10, 15, 20, 30, 45, 60];

export async function setTripMargin(key: string, min: number | null): Promise<{ ok: boolean }> {
  const start = Number(key.split('|')[0]);
  if (!Number.isFinite(start) || key.length > 200 || (min != null && !TRIP_MARGINS.includes(min))) return { ok: false };
  const jar = await cookies();
  let map: Record<string, number> = {};
  try { map = JSON.parse(jar.get('trip_margins')?.value ?? '{}'); } catch { /* trasig kaka: börja om */ }
  const now = Date.now();
  map = Object.fromEntries(Object.entries(map).filter(([k]) => Number(k.split('|')[0]) > now - 3600_000).slice(-15));
  if (min == null) delete map[key]; else map[key] = min;
  jar.set('trip_margins', JSON.stringify(map), { maxAge: 60 * 86400, path: '/', sameSite: 'lax', httpOnly: true, secure: process.env.NODE_ENV === 'production' });
  return { ok: true };
}
