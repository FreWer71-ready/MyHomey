import { addDays, holidays, type Calendar, type CalEvent } from './calendar-view.ts';

// Skolschema från skolschema.se (klassens offentliga schema, hämtat ur skolans öppna schemavisning). Ren tolkning här;
// hämtningen i skolschema-source.ts. Sidan bäddar in veckans lektioner i sin RSC-data ("lessons" per veckodag 1–5).

export type Lesson = { dayOfWeekNumber: number; startStr: string; endStr: string; type: string; name: string; room: string };
export type SchoolWeek = { week: number; year: number; lessons: Record<string, Lesson[]> };
export type SchoolDay = { date: string; start: string; end: string; slots: number };

/**
 * Konfiguration: SKOLSCHEMA="Wilmer=https://skolschema.se/eskilstuna/gökstensskolan/7c;Molly=https://skolschema.se/…" (semikolon
 * mellan barnen). Bara adresser på skolschema.se (https) godtas; frågetecken och fragment tas bort, eftersom sajtens robots.txt
 * stänger av veckolänkarna (?v=) för automatiska hämtningar. Den vanliga klasssidan visar aktuell vecka (från lördagen nästa).
 */
export function parseSkolschemaConfig(raw: string | undefined): { name: string; url: string }[] {
  const out: { name: string; url: string }[] = [];
  for (const part of (raw ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq < 1) continue;
    const name = part.slice(0, eq).trim();
    try {
      const u = new URL(part.slice(eq + 1).trim());
      if (!name || u.protocol !== 'https:' || u.hostname !== 'skolschema.se' || u.pathname.split('/').filter(Boolean).length < 3) continue;
      out.push({ name, url: `https://skolschema.se${u.pathname.replace(/\/+$/, '')}` });
    } catch { /* ogiltig adress hoppas över */ }
  }
  return out;
}

/** Veckans lektioner och vilken vecka sidan visar, ur sidans HTML. Null om sidan saknar schema (låst, tom eller ändrad). */
export function parseSkolschema(html: string): SchoolWeek | null {
  const text: string[] = [];
  for (const m of html.matchAll(/self\.__next_f\.push\((\[[\s\S]*?\])\)<\/script>/g)) {
    try { const a = JSON.parse(m[1]) as unknown[]; if (typeof a[1] === 'string') text.push(a[1]); } catch { /* hoppa över */ }
  }
  const payload = text.join('');
  const at = payload.indexOf('"lessons":');
  const from = at < 0 ? -1 : payload.indexOf('{', at);
  if (from < 0) return null;
  let depth = 0, end = -1;
  for (let i = from; i < payload.length; i++) {
    const c = payload[i];
    if (c === '"') { i++; while (i < payload.length && payload[i] !== '"') i += payload[i] === '\\' ? 2 : 1; } // hoppa över strängar
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) { end = i; break; }
  }
  if (end < 0) return null;
  let lessons: Record<string, Lesson[]>;
  try { lessons = JSON.parse(payload.slice(from, end + 1)); } catch { return null; }
  // "Vecka 48, 2026" i rubriken (taggar och kommentarer emellan).
  const wk = html.match(/Vecka(?:<[^>]*>|\s)*(\d{1,2})(?:<[^>]*>|\s|,|\.)*(20\d{2})/);
  if (!wk) return null;
  return { week: Number(wk[1]), year: Number(wk[2]), lessons };
}

/** Måndagen (YYYY-MM-DD) i ISO-vecka `week` år `year`. */
export function isoWeekMonday(year: number, week: number): string {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const mondayWeek1 = jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86400_000;
  return new Date(mondayWeek1 + (week - 1) * 7 * 86400_000).toISOString().slice(0, 10);
}

const hm = (s: string) => s.slice(0, 5);
/** Skoldagarna i veckan: datum, första start och sista slut ("08:00", "14:20") och antal lektionspass (parallella grupper räknas en gång). */
export function schoolDays(w: SchoolWeek): SchoolDay[] {
  const monday = Date.parse(`${isoWeekMonday(w.year, w.week)}T12:00:00Z`);
  return Object.entries(w.lessons).flatMap(([day, ls]) => {
    const n = Number(day);
    if (!Array.isArray(ls) || !ls.length || !(n >= 1 && n <= 7)) return [];
    const starts = ls.map((l) => hm(l.startStr)).sort(), ends = ls.map((l) => hm(l.endStr)).sort();
    return [{
      date: new Date(monday + (n - 1) * 86400_000).toISOString().slice(0, 10), start: starts[0], end: ends.at(-1)!,
      slots: new Set(ls.map((l) => `${l.startStr}-${l.endStr}`)).size,
    }];
  }).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Manuella skoldagar när ingen källa finns: SKOLSCHEMA_MANUELLT="Molly|2026-11-23|08:30-15:45|4;Molly|2026-11-24|08:30-15:35|5"
 * (namn | datum | första start–sista slut | antal lektioner, semikolon mellan dagarna). Gäller bara de datumen, så de går ut av
 * sig själva. Ogiltiga poster hoppas över.
 */
export function parseManualDays(raw: string | undefined): (SchoolDay & { name: string })[] {
  const out: (SchoolDay & { name: string })[] = [];
  for (const part of (raw ?? '').split(';')) {
    const m = part.trim().match(/^([^|]+)\|(\d{4}-\d{2}-\d{2})\|(\d{1,2}:\d{2})-(\d{1,2}:\d{2})\|(\d{1,2})$/);
    if (!m) continue;
    const norm = (t: string) => t.padStart(5, '0');
    const [start, end, slots] = [norm(m[3]), norm(m[4]), Number(m[5])];
    if (!(Date.parse(`${m[2]}T12:00:00Z`) > 0) || start >= end || start > '23:59' || end > '23:59' || slots < 1) continue;
    out.push({ name: m[1].trim(), date: m[2], start, end, slots });
  }
  return out;
}

/** Hämtade skoldagar (null = gick inte att hämta) och manuella dagar ihop; manuella gäller på samma datum. Null om inget finns. */
export function mergeSchoolDays(fetched: SchoolDay[] | null, manual: SchoolDay[]): SchoolDay[] | null {
  if (!fetched && !manual.length) return null;
  const by = new Map<string, SchoolDay>((fetched ?? []).map((d) => [d.date, d]));
  for (const d of manual) by.set(d.date, { date: d.date, start: d.start, end: d.end, slots: d.slots });
  return [...by.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Lov och ledigheter som inte följer av röda dagar: SKOLSCHEMA_LEDIGT="2026-12-21..2027-01-06;2027-02-22..2027-02-26;2027-05-14"
 * (intervall med .. eller enstaka datum, semikolon emellan). Ogiltiga poster hoppas över.
 */
export function parseBreaks(raw: string | undefined): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  for (const part of (raw ?? '').split(';')) {
    const m = part.trim().match(/^(\d{4}-\d{2}-\d{2})(?:\.\.(\d{4}-\d{2}-\d{2}))?$/);
    if (!m) continue;
    const to = m[2] ?? m[1];
    if (Date.parse(`${m[1]}T12:00:00Z`) > 0 && Date.parse(`${to}T12:00:00Z`) > 0 && m[1] <= to) out.push({ from: m[1], to });
  }
  return out;
}

const mondayOf = (date: string) => addDays(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7));

/**
 * Veckorna är återkommande: skolans senaste kända vecka (hämtad, annars manuellt inlagd) kopieras `weeks` veckor framåt, utom
 * på röda dagar och lov/ledigheter (`breaks`). Bara dagar som saknas i `known` läggs till, så hämtade och manuella dagar gäller
 * alltid före kopian. Utan underlag ges ingenting.
 */
export function projectWeeks(known: SchoolDay[], weeks: number, breaks: { from: string; to: string }[]): SchoolDay[] {
  if (!known.length || weeks < 1) return [];
  const lastMonday = mondayOf(known.map((d) => d.date).sort().at(-1)!);
  const base = known.filter((d) => mondayOf(d.date) === lastMonday);
  const have = new Set(known.map((d) => d.date));
  const out: SchoolDay[] = [];
  for (let k = 1; k <= weeks; k++) {
    for (const d of base) {
      const date = addDays(d.date, 7 * k);
      if (have.has(date) || holidays(Number(date.slice(0, 4))).has(date) || breaks.some((b) => b.from <= date && date <= b.to)) continue;
      out.push({ ...d, date });
    }
  }
  return out.sort((x, y) => x.date.localeCompare(y.date));
}

/**
 * Barnens skoldagar som poster i en kalender ("Wilmer i skolan", från första start till sista slut, med antal lektioner),
 * för kalenderkortet på Hem. Bara dagar som finns i kalenderns fönster; poster utan plats (får inte ge reseförslag). Ändrar inte
 * originalet.
 */
export function withSchoolDays(cal: Calendar, kids: { name: string; cal: Calendar | null }[]): Calendar {
  const days = cal.days.map((d) => ({ ...d, timed: [...d.timed] }));
  const byDate = new Map(days.map((d) => [d.date, d]));
  for (const kid of kids) {
    for (const kd of kid.cal?.days ?? []) {
      const e = kd.timed.find((t) => t.id.startsWith('skola@'));
      const day = byDate.get(kd.date);
      if (!e || !day) continue;
      day.timed.push({ ...e, id: `skola@${kd.date}@${kid.name}`, title: `${kid.name} i skolan`, src: undefined } satisfies CalEvent);
    }
  }
  for (const d of days) d.timed.sort((a, b) => a.start! - b.start!);
  return { ...cal, days };
}
