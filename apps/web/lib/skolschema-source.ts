import 'server-only';
import { zoned } from './calendar.ts';
import type { CalEvent, Calendar } from './calendar-view.ts';
import { parseSkolschema, parseSkolschemaConfig, schoolDays } from './skolschema.ts';

// Barnens skolscheman (SKOLSCHEMA, se skolschema.ts) som kalendrar: en händelse per skoldag, "Skola" från första start till
// sista slut med antal lektioner. Klasssidan hämtas högst en gång per två timmar (sajten uppdaterar högst var andra dag) och
// bara den vanliga adressen, inte veckolänkarna (?v=), som deras robots.txt stänger av för automatik. Visar alltså aktuell
// vecka (från lördagen nästa). Inga personuppgifter skickas; bara en neutral klientrubrik.
export const skolschemaConfigured = () => parseSkolschemaConfig(process.env.SKOLSCHEMA).length > 0;

const at = (date: string, hhmm: string) => {
  const [y, m, d] = date.split('-').map(Number), [h, mi] = hhmm.split(':').map(Number);
  return zoned(y, m, d, h, mi, 0);
};

async function load(url: string): Promise<Calendar | null> {
  try {
    const res = await fetch(url, { next: { revalidate: 7200 }, signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'MyHomeyDashboard (privat dashboard, högst en hämtning per två timmar)' } });
    if (!res.ok) return null;
    const week = parseSkolschema(await res.text());
    if (!week) return null;
    const days = schoolDays(week).map((d) => ({
      date: d.date, allDay: [],
      timed: [{ id: `skola@${d.date}`, title: 'Skola', location: `${d.slots} lektioner`, start: at(d.date, d.start), end: at(d.date, d.end), allDay: false, firstDay: d.date, lastDay: d.date } satisfies CalEvent],
    }));
    return { days, generated: Date.now() };
  } catch {
    return null;
  }
}

/** Alla konfigurerade skolscheman; cal är null om ett inte gick att hämta (låst, nere eller sidan ändrad). */
export const loadSchoolCalendars = () =>
  Promise.all(parseSkolschemaConfig(process.env.SKOLSCHEMA).map(async (c) => ({ name: c.name, cal: await load(c.url) })));
