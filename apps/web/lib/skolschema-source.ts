import 'server-only';
import { zoned } from './calendar.ts';
import type { CalEvent, Calendar } from './calendar-view.ts';
import { mergeSchoolDays, parseBreaks, parseManualDays, parseSkolschema, parseSkolschemaConfig, projectWeeks, schoolDays, type SchoolDay } from './skolschema.ts';

// Barnens skolscheman (SKOLSCHEMA, se skolschema.ts) som kalendrar: en händelse per skoldag, "Skola" från första start till
// sista slut med antal lektioner. Klasssidan hämtas högst en gång per två timmar (sajten uppdaterar högst var andra dag) och
// bara den vanliga adressen, inte veckolänkarna (?v=), som deras robots.txt stänger av för automatik. Aktuell vecka kopieras
// sedan framåt (projectWeeks), eftersom veckorna är återkommande. Inga personuppgifter skickas; bara en neutral klientrubrik.
/** SKOLSCHEMA_AV=1 stänger av barnens skolscheman helt (Kalender-sidan, rapporten, kalenderkortet) utan att ta bort inställningarna (hos Fredrik: bara Ulrikas dashboard visar dem). */
const schoolOff = () => /^(1|true|ja)$/i.test(process.env.SKOLSCHEMA_AV ?? '');
export const skolschemaConfigured = () => !schoolOff() && (parseSkolschemaConfig(process.env.SKOLSCHEMA).length > 0 || parseManualDays(process.env.SKOLSCHEMA_MANUELLT).length > 0);

/** Visa barnens skoldagar som poster i kalenderkortet på Hem (SKOLSCHEMA_KALENDER=1, t.ex. bara hos Ulrika). */
export const skolschemaInCalendar = () => /^(1|true|ja)$/i.test(process.env.SKOLSCHEMA_KALENDER ?? '') && skolschemaConfigured();

/** Antal veckor som den senaste veckan kopieras framåt (SKOLSCHEMA_VECKOR, standard 8, högst 26, 0 = av). */
const projectedWeeks = () => { const n = Number(process.env.SKOLSCHEMA_VECKOR ?? 8); return Number.isFinite(n) ? Math.min(26, Math.max(0, Math.floor(n))) : 8; };

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
  if (schoolOff()) return [];
  const sources = parseSkolschemaConfig(process.env.SKOLSCHEMA);
  const manual = parseManualDays(process.env.SKOLSCHEMA_MANUELLT);
  const names = [...sources.map((c) => c.name), ...[...new Set(manual.map((d) => d.name))].filter((n) => !sources.some((c) => c.name === n))];
  return Promise.all(names.map(async (name) => {
    const src = sources.find((c) => c.name === name);
    const own = manual.filter((d) => d.name === name);
    const days = mergeSchoolDays(src ? await loadDays(src.url) : null, own);
    // Kommande veckor: skolans senaste vecka kopieras framåt (veckorna är återkommande), utom röda dagar och lov (SKOLSCHEMA_LEDIGT).
    const all = days ? [...days, ...projectWeeks(days, projectedWeeks(), parseBreaks(process.env.SKOLSCHEMA_LEDIGT))].sort((a, b) => a.date.localeCompare(b.date)) : null;
    return { name, cal: all ? toCalendar(all) : null };
  }));
}
