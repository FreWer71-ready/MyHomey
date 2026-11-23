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
