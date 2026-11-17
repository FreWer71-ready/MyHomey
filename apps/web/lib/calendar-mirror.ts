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
let memo: { at: number; cal: Calendar } | null = null;

export async function loadMirrorServer(): Promise<Calendar | null> {
  if (!mirrorConfigured()) return null;
  if (memo && Date.now() - memo.at < CAL_TTL * 1000) return memo.cal;
  try {
    // Ingen Next-cache och inga omdirigeringar: ett felsvar (t.ex. inloggningssidan) får inte sparas som kalendern.
    const res = await fetch(process.env.CALENDAR_MIRROR_URL!, {
      headers: { Authorization: `Bearer ${process.env.CALENDAR_MIRROR_TOKEN}`, Accept: 'application/json' },
      cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    const body = res.ok ? (() => { try { return JSON.parse(text); } catch { return null; } })() : null;
    if (body?.days) { memo = { at: Date.now(), cal: body as Calendar }; return memo.cal; }
    // Typ och början av svaret (aldrig adressen eller nyckeln) för felsökning.
    console.error(`Speglad kalender: oväntat svar (status ${res.status}, ${res.headers.get('content-type') ?? '?'}): ${text.slice(0, 80).replace(/\s+/g, ' ')}`);
  } catch (e) {
    console.error(`Speglad kalender: hämtningen misslyckades (${(e as Error)?.name ?? 'fel'})`);
  }
  return null;
}
