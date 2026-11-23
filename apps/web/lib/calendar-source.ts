import 'server-only';
import { FORZA_API, forzaIcsFromResponse, forzaTeams } from './forza';
import { isBusyOnly, mergeCalendars, parseCalendar, summarizeBusy, withoutAllDay, type Calendar } from './calendar';

// Hämtar och tolkar installationens kalendrar. Bara på servern.
// CALENDAR_ICAL_URL (privat) plus valfria CALENDAR_ICAL_URL_<NAMN> (t.ex. _WORK för jobbets Outlook); för Ulrika ULRIKA_ICAL_URL(_<NAMN>).
// Adresserna får aldrig hamna i loggar, felmeddelanden eller svar.
export const CAL_TTL = 600; // 10 minuter
const memo = new Map<string, { at: number; cal: Calendar }>(); // per fönster (back:days)

/** Alla kalenderadresser i fast ordning (grundinställningen först, sedan extra efter namn) – ordningen ger färgen. */
export function calendarUrls(): string[] {
  const keys = Object.keys(process.env).filter((k) => /^(CALENDAR|ULRIKA)_ICAL_URL(_[A-Z0-9]+)?$/.test(k)).sort();
  const raw = keys.map((k) => process.env[k] ?? '');
  // Varje inställning kan ha flera adresser (mellanslag, komma eller radbrytning). webcal:// hämtas som https://.
  const ical = raw.join(' ').split(/[\s,]+/).filter(Boolean).map((u) => u.replace(/^webcal:\/\//i, 'https://'));
  // Fotboll (Forza): FORZA_TEAMS="11413" ger lagets matcher som en egen kalender sist i listan (övriga kalendrars färger påverkas inte).
  return [...ical, ...forzaTeams(process.env.FORZA_TEAMS).map((id) => `forza:${id}`)];
}
export const calendarConfigured = () => calendarUrls().length > 0;

/**
 * Kalendern för idag + 30 dagar (kortet visar en vecka, rutan vid tryck en månad), eller null om ingen kalender är kopplad eller ingen gick att hämta.
 * `range` ger ett annat fönster: back = dagar före idag, days = dagar efter (månadsvyn använder monthsWindow).
 */
export async function loadCalendarServer(range: { back: number; days: number } = { back: 0, days: 30 }): Promise<Calendar | null> {
  const urls = calendarUrls();
  if (!urls.length) return null;
  const key = `${range.back}:${range.days}`;
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < CAL_TTL * 1000) return hit.cal;
  const parsed = await Promise.all(urls.map(async (u, i) => {
    try {
      // Next cachar varje flöde i 10 min (delas mellan serverinstanser), minnet ovan sparar tolkningen.
      const forza = u.startsWith('forza:');
      const res = await fetch(forza ? `${FORZA_API}/${u.slice(6)}/matches` : u, { next: { revalidate: CAL_TTL }, signal: AbortSignal.timeout(10_000) });
      const text = res.ok ? (forza ? await forzaIcsFromResponse(res) : await res.text()) : '';
      if (text.trimStart().startsWith('BEGIN:VCALENDAR')) {
        // Kalendrar som bara visar ledig/upptagen (t.ex. jobbets Outlook) slås ihop till "Möten på jobbet" per dag.
        const cal = parseCalendar(text, Date.now(), range.days, range.back);
        // Bara antal (aldrig titlar eller adresser), för felsökning när en kalender verkar tom.
        const n = (k: 'timed' | 'allDay') => cal.days.reduce((a, d) => a + d[k].length, 0);
        console.info(`Kalender ${i + 1}: ${n('timed')} med tid, ${n('allDay')} heldag (${range.back + range.days} dygn)`);
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
  // Heldagshändelser döljs i alla vyer. CALENDAR_SHOW_ALL_DAY=1 visar dem igen.
  const all = mergeCalendars(parsed.map((c) => c ?? { days: okCals[0].days.map((d) => ({ date: d.date, allDay: [], timed: [] })), generated: 0 }));
  const merged = process.env.CALENDAR_SHOW_ALL_DAY === '1' ? all : withoutAllDay(all);
  memo.set(key, { at: Date.now(), cal: merged });
  return merged;
}
