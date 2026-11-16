import 'server-only';
import { isBusyOnly, mergeCalendars, parseCalendar, summarizeBusy, type Calendar } from './calendar';

// Hämtar och tolkar installationens kalendrar. Bara på servern.
// CALENDAR_ICAL_URL (privat) plus valfria CALENDAR_ICAL_URL_<NAMN> (t.ex. _WORK för jobbets Outlook); för Ulrika ULRIKA_ICAL_URL.
// Adresserna får aldrig hamna i loggar, felmeddelanden eller svar.
export const CAL_TTL = 600; // 10 minuter
let memo: { at: number; cal: Calendar } | null = null;

/** Alla kalenderadresser i fast ordning (grundinställningen först, sedan extra efter namn) – ordningen ger färgen. */
export function calendarUrls(): string[] {
  const keys = Object.keys(process.env).filter((k) => /^CALENDAR_ICAL_URL(_[A-Z0-9]+)?$/.test(k)).sort();
  const raw = keys.length ? keys.map((k) => process.env[k] ?? '') : [process.env.ULRIKA_ICAL_URL ?? ''];
  // Varje inställning kan ha flera adresser (mellanslag, komma eller radbrytning). webcal:// hämtas som https://.
  return raw.join(' ').split(/[\s,]+/).filter(Boolean).map((u) => u.replace(/^webcal:\/\//i, 'https://'));
}
export const calendarConfigured = () => calendarUrls().length > 0;

/** Kalendern för idag + 30 dagar (kortet visar en vecka, rutan vid tryck en månad), eller null om ingen kalender är kopplad eller ingen gick att hämta. */
export async function loadCalendarServer(): Promise<Calendar | null> {
  const urls = calendarUrls();
  if (!urls.length) return null;
  if (memo && Date.now() - memo.at < CAL_TTL * 1000) return memo.cal;
  const parsed = await Promise.all(urls.map(async (u, i) => {
    try {
      // Next cachar varje flöde i 10 min (delas mellan serverinstanser), minnet ovan sparar tolkningen.
      const res = await fetch(u, { next: { revalidate: CAL_TTL }, signal: AbortSignal.timeout(10_000) });
      const text = res.ok ? await res.text() : '';
      if (text.trimStart().startsWith('BEGIN:VCALENDAR')) {
        // Kalendrar som bara visar ledig/upptagen (t.ex. jobbets Outlook) slås ihop till "Möten på jobbet" per dag.
        const cal = parseCalendar(text, Date.now(), 30);
        return isBusyOnly(cal) ? summarizeBusy(cal) : cal;
      }
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
