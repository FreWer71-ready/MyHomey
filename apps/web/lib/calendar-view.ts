// Kalender: typer och visningshjälp som även webbläsaren använder (utan node-ical).

export const TZ = 'Europe/Stockholm';

export type CalEvent = {
  id: string;
  title: string;
  location: string | null;
  /** Tidsatta: ms (UTC). Heldag: null. */
  start: number | null;
  end: number | null;
  /** Heldag: första och sista dagen (YYYY-MM-DD, inklusive). */
  allDay: boolean;
  firstDay: string;
  lastDay: string;
};
export type CalDay = { date: string; allDay: CalEvent[]; timed: CalEvent[] };
export type Calendar = { days: CalDay[]; generated: number };

export const parts = (ms: number, tz: string) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(ms).map((x) => [x.type, x.value]),
  );
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
};
/** Datum (YYYY-MM-DD) för ett ögonblick i given tidszon. */
export const dayOf = (ms: number, tz = TZ) => {
  const { y, m, d } = parts(ms, tz);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};
export const addDays = (date: string, n: number) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
/** Rubrik för en dag: "Idag", "Imorgon", annars veckodag med datum ("lördag 15 nov"). */
export function dayLabel(date: string, now = Date.now()): string {
  const today = dayOf(now);
  if (date === today) return 'Idag';
  if (date === addDays(today, 1)) return 'Imorgon';
  const ms = Date.parse(`${date}T12:00:00Z`);
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'short' }).format(ms).replace('.', '');
}

/** Pågår just nu (tidsatt händelse). */
export const isOngoing = (e: CalEvent, now = Date.now()) => !e.allDay && e.start! <= now && now < e.end!;
