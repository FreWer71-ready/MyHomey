import 'server-only';
import { mergeCalendars, parseCalendar, type Calendar } from './calendar';

// Hämtar och tolkar installationens kalendrar (CALENDAR_ICAL_URL, för Ulrika ULRIKA_ICAL_URL). Bara på servern.
// Adresserna får aldrig hamna i loggar, felmeddelanden eller svar.
export const CAL_TTL = 600; // 10 minuter
let memo: { at: number; cal: Calendar } | null = null;

export const calendarConfigured = () => !!(process.env.CALENDAR_ICAL_URL || process.env.ULRIKA_ICAL_URL);

/** Kalendern för idag + 7 dagar, eller null om ingen kalender är kopplad eller ingen gick att hämta. */
export async function loadCalendarServer(): Promise<Calendar | null> {
  const url = process.env.CALENDAR_ICAL_URL || process.env.ULRIKA_ICAL_URL;
  if (!url) return null;
  if (memo && Date.now() - memo.at < CAL_TTL * 1000) return memo.cal;
  // Flera kalendrar: adresserna separeras med mellanslag, komma eller radbrytning. webcal:// hämtas som https://.
  const urls = url.split(/[\s,]+/).filter(Boolean).map((u) => u.replace(/^webcal:\/\//i, 'https://'));
  const parsed = await Promise.all(urls.map(async (u, i) => {
    try {
      // Next cachar varje flöde i 10 min (delas mellan serverinstanser), minnet ovan sparar tolkningen.
      const res = await fetch(u, { next: { revalidate: CAL_TTL }, signal: AbortSignal.timeout(10_000) });
      const text = res.ok ? await res.text() : '';
      if (text.trimStart().startsWith('BEGIN:VCALENDAR')) return parseCalendar(text);
      console.error(`Kalender ${i + 1}: oväntat svar (status ${res.status})`);
    } catch (e) {
      // Bara feltypen loggas: meddelandet kan innehålla adressen.
      console.error(`Kalender ${i + 1}: hämtningen misslyckades (${(e as Error)?.name ?? 'fel'})`);
    }
    return null;
  }));
  const okCals = parsed.filter((c): c is Calendar => !!c);
  if (!okCals.length) return null;
  // Behåll källordningen (färgen per kalender) även om någon misslyckas.
  const merged = mergeCalendars(parsed.map((c) => c ?? { days: okCals[0].days.map((d) => ({ date: d.date, allDay: [], timed: [] })), generated: 0 }));
  memo = { at: Date.now(), cal: merged };
  return merged;
}
