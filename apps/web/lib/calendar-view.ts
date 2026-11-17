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
  /** Vilken kalender händelsen kommer från (0, 1, …) när flera slås ihop. */
  src?: number;
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

/** Färg per kalender (prick vid händelsen). */
export const CAL_COLORS = ['#8B5CF6', '#34C27A', '#4FA3FF', '#FF8A3D', '#F0503C', '#FFC21A'];

/** Pågår just nu (tidsatt händelse). */
export const isOngoing = (e: CalEvent, now = Date.now()) => !e.allDay && e.start! <= now && now < e.end!;

/** Kortare titlar: "IFK Mariefred  - FBC Nyköping  (Division 3 Herr Västra)" -> "IFK Mariefred – FBC Nyköping". */
export const shortTitle = (t: string) =>
  t.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+-\s+/g, ' – ').replace(/\s{2,}/g, ' ').trim();
/** Egna lagets matcher lyfts fram (OWN_TEAM, standard Torshälla). */
export const isOwnTeam = (t: string, team = 'Torshälla') => new RegExp(team, 'i').test(t);

// ---- Helg och röda dagar ----

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const plus = (d: Date, n: number) => new Date(d.getTime() + n * 86400_000);

/** Påskdagen (gregoriansk, Meeus/Jones/Butcher). */
function easter(y: number): Date {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  return utc(y, Math.floor((h + l - 7 * m + 114) / 31), ((h + l - 7 * m + 114) % 31) + 1);
}
/** Första dagen med veckodag `wd` (0 = sön) från och med datumet. */
const firstWeekday = (d: Date, wd: number) => plus(d, (wd - d.getUTCDay() + 7) % 7);

const holidayCache = new Map<number, Map<string, string>>();
/** Svenska röda dagar och de facto lediga aftnar (midsommar-, jul- och nyårsafton) för ett år. */
export function holidays(y: number): Map<string, string> {
  const hit = holidayCache.get(y);
  if (hit) return hit;
  const p = easter(y);
  const midsummerEve = firstWeekday(utc(y, 6, 19), 5);
  const list: [Date, string][] = [
    [utc(y, 1, 1), 'Nyårsdagen'], [utc(y, 1, 6), 'Trettondedag jul'],
    [plus(p, -2), 'Långfredagen'], [p, 'Påskdagen'], [plus(p, 1), 'Annandag påsk'],
    [utc(y, 5, 1), 'Första maj'], [plus(p, 39), 'Kristi himmelsfärd'], [plus(p, 49), 'Pingstdagen'],
    [utc(y, 6, 6), 'Nationaldagen'], [midsummerEve, 'Midsommarafton'], [plus(midsummerEve, 1), 'Midsommardagen'],
    [firstWeekday(utc(y, 10, 31), 6), 'Alla helgons dag'],
    [utc(y, 12, 24), 'Julafton'], [utc(y, 12, 25), 'Juldagen'], [utc(y, 12, 26), 'Annandag jul'], [utc(y, 12, 31), 'Nyårsafton'],
  ];
  const map = new Map(list.map(([d, n]) => [ymd(d), n]));
  holidayCache.set(y, map);
  return map;
}

export type DayInfo = {
  /** "Idag", "Imorgon" eller veckodagen ("Torsdag"). */ main: string;
  /** Kort datum: "tis 17 nov" för idag/imorgon, annars "19 nov". */ sub: string;
  /** Lördag, söndag eller röd dag. */ free: boolean;
  /** Röd dags namn (t.ex. "Juldagen"), annars null. */ holiday: string | null;
  /** ISO-veckonummer. */ week: number;
};

/** Rubrikdelar för en dag (YYYY-MM-DD) i kalendern. */
export function dayInfo(date: string, now = Date.now()): DayInfo {
  const [y, m, d] = date.split('-').map(Number);
  const dt = utc(y, m, d);
  const wd = dt.getUTCDay();
  const holiday = holidays(y).get(date) ?? null;
  const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'UTC', ...o }).format(dt).replace('.', '');
  const today = dayOf(now);
  const rel = date === today ? 'Idag' : date === addDays(today, 1) ? 'Imorgon' : null;
  const weekday = fmt({ weekday: 'long' });
  // ISO-vecka: torsdagen i samma vecka avgör året.
  const thu = plus(dt, 3 - ((wd + 6) % 7));
  const week = Math.floor((thu.getTime() - utc(thu.getUTCFullYear(), 1, 1).getTime()) / (7 * 86400_000)) + 1;
  return {
    main: rel ?? weekday.charAt(0).toUpperCase() + weekday.slice(1),
    sub: rel ? `${fmt({ weekday: 'short' })} ${fmt({ day: 'numeric', month: 'short' })}` : fmt({ day: 'numeric', month: 'short' }),
    free: wd === 0 || wd === 6 || !!holiday, holiday, week,
  };
}

/** Helg och röda dagar i listor (kalender, väder): varm bakgrund, text och etikett. */
export const FREE_BG = 'rgba(255, 170, 90, 0.08)';
export const FREE_FG = '#FFB86B';
export const FREE_CHIP = 'rgba(255, 170, 90, 0.16)';
