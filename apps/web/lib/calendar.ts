// Kalender: tolkar ett iCal-flöde (Google Kalender) till händelser för idag + 7 dagar i Europe/Stockholm.
// Ren logik (ingen hämtning). Återkommande händelser (RRULE) expanderas med hänsyn till EXDATE,
// flyttade/ändrade tillfällen (RECURRENCE-ID) och sommartid.
import ical from 'node-ical';

import { addDays, dayOf, parts, TZ, type CalDay, type CalEvent, type Calendar } from './calendar-view.ts';
export * from './calendar-view.ts';

// ---- Tidszonshjälp (utan externa bibliotek) ----

const offset = (ms: number, tz: string) => {
  const p = parts(ms, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
};
/** Väggklocktid i tidszonen -> ögonblick (UTC ms). Hanterar sommartidsskiften. */
export function zoned(y: number, m: number, d: number, h: number, mi: number, s: number, tz = TZ): number {
  const guess = Date.UTC(y, m - 1, d, h, mi, s);
  const first = guess - offset(guess, tz);
  return guess - offset(first, tz);
}
/** Heldagsdatum som node-ical skapar (lokal midnatt i serverns tidszon) -> YYYY-MM-DD. */
const dateOnly = (dt: Date) =>
  `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;

// ---- Tolkning ----

type IcsDate = Date & { tz?: string; dateOnly?: boolean };
type VEvent = {
  type: string; uid?: string; summary?: string | { val: string }; location?: string | { val: string }; status?: string;
  start: IcsDate; end?: IcsDate; datetype?: string; duration?: string;
  rrule?: { between(a: Date, b: Date, inc: boolean): Date[] };
  exdate?: Record<string, IcsDate>; recurrences?: Record<string, VEvent>; recurrenceid?: IcsDate;
};

const text = (v: VEvent['summary']) => (typeof v === 'string' ? v : v?.val ?? '').trim();
const isAllDay = (e: VEvent) => e.datetype === 'date' || !!e.start?.dateOnly;
const zoneOf = (e: VEvent) => {
  const tz = e.start?.tz;
  // node-ical ger IANA-namn eller Windows-namn; okända tolkas som Stockholm.
  try { if (tz && !tz.startsWith('/')) { new Intl.DateTimeFormat('en', { timeZone: tz }); return tz; } } catch { /* okänd zon */ }
  return TZ;
};

/** Händelser idag och kommande `days` dagar (Stockholm), sorterade per dag. */
export function parseCalendar(ics: string, now = Date.now(), days = 7): Calendar {
  const data = ical.sync.parseICS(ics) as unknown as Record<string, VEvent>;
  const today = dayOf(now);
  const lastDay = addDays(today, days);
  const from = zoned(...(today.split('-').map(Number) as [number, number, number]), 0, 0, 0);
  const to = zoned(...(addDays(lastDay, 1).split('-').map(Number) as [number, number, number]), 0, 0, 0);
  const out: CalEvent[] = [];

  const push = (e: VEvent, start: Date, end: Date | undefined, key: string) => {
    if ((e.status ?? '').toUpperCase() === 'CANCELLED') return;
    const title = text(e.summary) || 'Upptagen';
    const location = text(e.location) || null;
    if (isAllDay(e)) {
      const first = dateOnly(start);
      const endDay = end ? addDays(dateOnly(end), -1) : first; // DTEND är exklusivt
      const last = endDay < first ? first : endDay;
      if (last < today || first > lastDay) return;
      out.push({ id: key, title, location, start: null, end: null, allDay: true, firstDay: first, lastDay: last });
    } else {
      const s = start.getTime();
      const en = end ? end.getTime() : s;
      if (en <= from && s < from) return;
      if (s >= to) return;
      out.push({ id: key, title, location, start: s, end: en, allDay: false, firstDay: dayOf(s), lastDay: dayOf(Math.max(s, en - 1)) });
    }
  };

  for (const e of Object.values(data)) {
    if (e?.type !== 'VEVENT' || !e.start) continue;
    if (e.recurrenceid) continue; // flyttade tillfällen hanteras via huvudhändelsens recurrences
    const dur = e.end ? e.end.getTime() - e.start.getTime() : isAllDay(e) ? 86400_000 : 0;
    const uid = e.uid ?? text(e.summary);

    if (!e.rrule) {
      push(e, e.start, e.end, uid);
      continue;
    }

    const tz = zoneOf(e);
    const exdates = Object.values(e.exdate ?? {}).map((d) => d.getTime());
    const exdays = new Set(Object.values(e.exdate ?? {}).map((d) => (isAllDay(e) ? dateOnly(d) : dayOf(d.getTime(), tz))));
    const overrides = Object.values(e.recurrences ?? {});
    const wall = parts(e.start.getTime(), tz);
    const shift = offset(e.start.getTime(), tz);
    const seen = new Set<string>();

    // Sök lite bredare än fönstret: långa händelser och tidszonsförskjutning.
    for (const occ of e.rrule.between(new Date(from - dur - 2 * 86400_000), new Date(to + 2 * 86400_000), true)) {
      let start: Date;
      if (isAllDay(e)) {
        start = occ;
      } else {
        // rrule räknar i UTC; behåll originalets väggklocktid i dess tidszon (sommartid).
        const localDay = new Date(occ.getTime() + shift).toISOString().slice(0, 10).split('-').map(Number);
        start = new Date(zoned(localDay[0], localDay[1], localDay[2], wall.h, wall.mi, wall.s, tz));
      }
      const day = isAllDay(e) ? dateOnly(start) : dayOf(start.getTime(), tz);
      if (exdates.some((x) => Math.abs(x - start.getTime()) < 60_000) || (isAllDay(e) && exdays.has(day))) continue;
      const moved = overrides.find((o) => o.recurrenceid && (isAllDay(e)
        ? dateOnly(o.recurrenceid) === day
        : Math.abs(o.recurrenceid.getTime() - start.getTime()) < 60_000));
      const key = `${uid}@${day}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (moved) push({ ...e, ...moved, rrule: undefined }, moved.start, moved.end ?? new Date(moved.start.getTime() + dur), key);
      else push(e, start, new Date(start.getTime() + dur), key);
    }
  }

  // Dela upp per dag: tidsatta på varje dag de berör (från idag), heldag likaså.
  const result: CalDay[] = [];
  for (let i = 0; i <= days; i++) {
    const date = addDays(today, i);
    const on = out.filter((x) => x.firstDay <= date && x.lastDay >= date);
    result.push({
      date,
      allDay: on.filter((x) => x.allDay).sort((a, b) => a.title.localeCompare(b.title, 'sv')),
      timed: on.filter((x) => !x.allDay).sort((a, b) => a.start! - b.start! || a.title.localeCompare(b.title, 'sv')),
    });
  }
  return { days: result, generated: now };
}


/** Slår ihop flera kalendrar (samma dagar) och märker varje händelse med sin kalender. Dubbletter tas bort. */
export function mergeCalendars(cals: Calendar[]): Calendar {
  if (cals.length === 1) return cals[0];
  const days = cals[0].days.map((d) => {
    const all = cals.flatMap((c, src) => {
      const day = c.days.find((x) => x.date === d.date);
      return day ? [...day.allDay, ...day.timed].map((e) => ({ ...e, src })) : [];
    });
    const seen = new Set<string>();
    const uniq = all.filter((e) => {
      const k = `${e.title}|${e.start ?? e.firstDay}|${e.end ?? e.lastDay}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    return {
      date: d.date,
      allDay: uniq.filter((e) => e.allDay).sort((a, b) => a.title.localeCompare(b.title, 'sv')),
      timed: uniq.filter((e) => !e.allDay).sort((a, b) => a.start! - b.start! || a.title.localeCompare(b.title, 'sv')),
    };
  });
  return { days, generated: Math.max(...cals.map((c) => c.generated)) };
}
