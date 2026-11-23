import 'server-only';
import { zoned } from './calendar.ts';
import type { CalEvent, Calendar } from './calendar-view.ts';
import { mergeSchoolDays, parseManualDays, parseSkolschema, parseSkolschemaConfig, schoolDays, type SchoolDay } from './skolschema.ts';

// Barnens skolscheman (SKOLSCHEMA, se skolschema.ts) som kalendrar: en händelse per skoldag, "Skola" från första start till
// sista slut med antal lektioner. Klasssidan hämtas högst en gång per två timmar (sajten uppdaterar högst var andra dag) och
// bara den vanliga adressen, inte veckolänkarna (?v=), som deras robots.txt stänger av för automatik. Visar alltså aktuell
// vecka (från lördagen nästa). Inga personuppgifter skickas; bara en neutral klientrubrik.
export const skolschemaConfigured = () => parseSkolschemaConfig(process.env.SKOLSCHEMA).length > 0 || parseManualDays(process.env.SKOLSCHEMA_MANUELLT).length > 0;

const at = (date: string, hhmm: string) => {
  const [y, m, d] = date.split('-').map(Number), [h, mi] = hhmm.split(':').map(Number);
  return zoned(y, m, d, h, mi, 0);
};

async function loadDays(url: string): Promise<SchoolDay[] | null> {
  try {
    const res = await fetch(url, { next: { revalidate: 7200 }, signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'MyHomeyDashboard (privat dashboard, högst en hämtning per två timmar)' } });
    if (!res.ok) return null;
    const week = parseSkolschema(await res.text());
    return week ? schoolDays(week) : null;
  } catch {
    return null;
  }
}

const toCalendar = (days: SchoolDay[]): Calendar => ({
  generated: Date.now(),
  days: days.map((d) => ({
    date: d.date, allDay: [],
    timed: [{ id: `skola@${d.date}`, title: 'Skola', location: `${d.slots} lektioner`, start: at(d.date, d.start), end: at(d.date, d.end), allDay: false, firstDay: d.date, lastDay: d.date } satisfies CalEvent],
  })),
});

/**
 * Alla barn: de som har en skolschema.se-adress (SKOLSCHEMA) och de som bara har manuella dagar (SKOLSCHEMA_MANUELLT), i den
 * ordningen. Manuella dagar gäller före hämtade på samma datum. cal är null om inget gick att få (låst, nere eller sidan ändrad).
 */
export async function loadSchoolCalendars(): Promise<{ name: string; cal: Calendar | null }[]> {
  const sources = parseSkolschemaConfig(process.env.SKOLSCHEMA);
  const manual = parseManualDays(process.env.SKOLSCHEMA_MANUELLT);
  const names = [...sources.map((c) => c.name), ...[...new Set(manual.map((d) => d.name))].filter((n) => !sources.some((c) => c.name === n))];
  return Promise.all(names.map(async (name) => {
    const src = sources.find((c) => c.name === name);
    const days = mergeSchoolDays(src ? await loadDays(src.url) : null, manual.filter((d) => d.name === name));
    return { name, cal: days ? toCalendar(days) : null };
  }));
}
