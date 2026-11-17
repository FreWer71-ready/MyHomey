import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { CAL_TTL } from './calendar-source';
import type { Calendar } from './calendar';

// Spegling av en annan dashboards kalendervy (t.ex. Fredriks hos Ulrika).
// Källan: CALENDAR_SHARE_TOKEN öppnar /api/calendar/share. Mottagaren: CALENDAR_MIRROR_URL + CALENDAR_MIRROR_TOKEN,
// rubrik i CALENDAR_MIRROR_TITLE. Adress och nyckel får aldrig hamna i loggar, felmeddelanden eller svar.

/** Rätt nyckel i Authorization: Bearer … (jämförs i konstant tid). */
export function shareAllowed(header: string | null): boolean {
  const token = process.env.CALENDAR_SHARE_TOKEN;
  if (!token || !header?.startsWith('Bearer ')) return false;
  const a = Buffer.from(header.slice(7)), b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const mirrorConfigured = () => !!process.env.CALENDAR_MIRROR_URL && !!process.env.CALENDAR_MIRROR_TOKEN;
export const mirrorTitle = () => process.env.CALENDAR_MIRROR_TITLE || 'Delad kalender';

/** Den speglade kalendern, eller null om den inte gick att hämta. */
export async function loadMirrorServer(): Promise<Calendar | null> {
  if (!mirrorConfigured()) return null;
  try {
    const res = await fetch(process.env.CALENDAR_MIRROR_URL!, {
      headers: { Authorization: `Bearer ${process.env.CALENDAR_MIRROR_TOKEN}` },
      next: { revalidate: CAL_TTL }, signal: AbortSignal.timeout(10_000),
    });
    const body = res.ok ? await res.json().catch(() => null) : null;
    if (body?.days) return body as Calendar;
    console.error(`Speglad kalender: oväntat svar (status ${res.status})`);
  } catch (e) {
    console.error(`Speglad kalender: hämtningen misslyckades (${(e as Error)?.name ?? 'fel'})`);
  }
  return null;
}
