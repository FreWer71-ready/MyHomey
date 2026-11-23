// Rapport som läses upp ("Hej Fredrik, idag är det tjugotredje november och det är regn …"). Ren logik, klientsäker
// (inga serverberoenden). Siffror skrivs som ord så att alla röster läser klockslag och tal likadant.
const TZ = 'Europe/Stockholm';

const ONES = ['noll', 'ett', 'två', 'tre', 'fyra', 'fem', 'sex', 'sju', 'åtta', 'nio', 'tio', 'elva', 'tolv', 'tretton', 'fjorton', 'femton', 'sexton', 'sjutton', 'arton', 'nitton'];
const TENS = ['', '', 'tjugo', 'trettio', 'fyrtio', 'femtio', 'sextio', 'sjuttio', 'åttio', 'nittio'];
/** 0–99 som ord: 57 → "femtiosju", 21 → "tjugoett". */
export const numWords = (n: number) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ONES[n % 10] : ''}`);
/** Antal i löpande text: 1 → "en", annars ord (tal över 99 som siffror). */
const cnt = (n: number) => (n === 1 ? 'en' : n < 100 ? numWords(n) : String(n));
const minutes = (n: number) => `${cnt(n)} ${n === 1 ? 'minut' : 'minuter'}`;

const ORDINAL = ['', 'första', 'andra', 'tredje', 'fjärde', 'femte', 'sjätte', 'sjunde', 'åttonde', 'nionde', 'tionde', 'elfte', 'tolfte', 'trettonde', 'fjortonde', 'femtonde', 'sextonde', 'sjuttonde', 'artonde', 'nittonde', 'tjugonde',
  'tjugoförsta', 'tjugoandra', 'tjugotredje', 'tjugofjärde', 'tjugofemte', 'tjugosjätte', 'tjugosjunde', 'tjugoåttonde', 'tjugonionde', 'trettionde', 'trettioförsta'];

const stockholm = (ms: number) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', day: 'numeric', hour: '2-digit', minute: '2-digit' }).formatToParts(ms).map((x) => [x.type, x.value]));
  return { day: Number(p.day), hour: Number(p.hour), minute: Number(p.minute) };
};
/** Klockslag som ord: 6:57 → "sex femtiosju", 9:00 → "nio", 7:05 → "sju noll fem", 16:04 → "sexton noll fyra". */
export function spokenTime(ms: number): string {
  const { hour, minute } = stockholm(ms);
  return minute === 0 ? numWords(hour) : minute < 10 ? `${numWords(hour)} noll ${numWords(minute)}` : `${numWords(hour)} ${numWords(minute)}`;
}
/** Dagens datum som ord: "tjugotredje november". */
export function spokenDate(ms: number): string {
  const month = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, month: 'long' }).format(ms);
  return `${ORDINAL[stockholm(ms).day]} ${month}`;
}

/** Temperatur i tal: 1 → "en plusgrad", 2 → "två plusgrader", -3 → "tre minusgrader", 0 → "noll grader". */
export function tempPhrase(t: number): string {
  const r = Math.round(t);
  return r === 0 ? 'noll grader' : r > 0 ? `${cnt(r)} plusgrad${r === 1 ? '' : 'er'}` : `${cnt(-r)} minusgrad${r === -1 ? '' : 'er'}`;
}
/** "regn och en plusgrad" (eller bara det ena); tom sträng utan data. */
export const weatherPhrase = (label?: string | null, temp?: number | null) =>
  [label?.trim().toLowerCase(), temp != null && Number.isFinite(temp) ? tempPhrase(temp) : null].filter(Boolean).join(' och ');

/** Hälsning: Godmorgon 04–09, annars Hej. */
export function greeting(now: number): string {
  const h = stockholm(now).hour;
  return h >= 4 && h < 10 ? 'Godmorgon' : 'Hej';
}

/** Tid på dygnet för avslutet: dag 04–17, kväll 18–21, natt 22–03 (Stockholm). */
export type DayPart = 'dag' | 'kvall' | 'natt';
export function dayPart(now: number): DayPart {
  const h = stockholm(now).hour;
  return h >= 4 && h < 18 ? 'dag' : h >= 18 && h < 22 ? 'kvall' : 'natt';
}
const CLOSING: Record<DayPart, string> = { dag: 'Ha en trevlig dag.', kvall: 'Ha en bra kväll.', natt: 'Sov gott.' };

/** Egna avslutsord ur `BRIEFING_AVSLUT="dag=Ha en fin dag;kväll=Ha en härlig kväll;natt=Sov gott"` (semikolonseparerat). Okända nycklar och tomma texter hoppas över. */
export function parseClosings(raw: string | undefined): Partial<Record<DayPart, string>> {
  const out: Partial<Record<DayPart, string>> = {};
  for (const part of (raw ?? '').split(';')) {
    const [k, ...rest] = part.split('=');
    const key = k?.trim().toLowerCase().replace('ä', 'a');
    const text = rest.join('=').trim().slice(0, 120);
    if ((key === 'dag' || key === 'kvall' || key === 'natt') && text) out[key] = /[.!?]$/.test(text) ? text : `${text}.`;
  }
  return out;
}
/** Avslutet efter klockan: "Ha en trevlig dag." / "Ha en bra kväll." / "Sov gott.", eller egna ord. */
export const closing = (now: number, custom: Partial<Record<DayPart, string>> = {}) => { const d = dayPart(now); return custom[d] ?? CLOSING[d]; };

/**
 * Rapportens text. Hälsningen står för sig ("Hej Fredrik.") och följs av ett stycke, så att rösten gör en tydlig paus
 * (Siri och andra röster gör längre uppehåll vid styckebrytning än vid kommatecken). Sedan datum, väder och `parts`
 * (övriga meningar, se `briefingParts`) i ett stycke.
 */
export function briefingText({ name, now, weather = '', parts = [] }: { name?: string; now: number; weather?: string; parts?: string[] }): string {
  const who = name?.trim() ? ` ${name.trim().charAt(0).toUpperCase()}${name.trim().slice(1)}` : '';
  const first = `Idag är det ${spokenDate(now)}${weather ? ` och det är ${weather} ute` : ''}.`;
  return `${greeting(now)}${who}.\n\n${[first, ...parts.map((p) => p.trim()).filter(Boolean)].join(' ')}`;
}

/** Match ur Forza-titeln "Hemma – Borta" (tankstreck med mellanslag runt); null för andra titlar. */
export const matchOf = (title: string): [string, string] | null => {
  const m = title.trim().match(/^(.+?)\s[–—]\s(.+)$/);
  return m ? [m[1].trim(), m[2].trim()] : null;
};
/** Titel för tal: en match blir "match mellan Hammarby IF och IFK Göteborg", andra titlar som de är. */
export const spokenTitle = (t: string) => { const m = matchOf(t); return m ? `match mellan ${m[0]} och ${m[1]}` : t; };

/** "A", "A och B", "A, B och C". */
export const joinList = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} och ${xs.at(-1)}`);

// ---- Delar ----
export const SECTIONS = ['vader', 'tag', 'forsta', 'hemresa', 'bil', 'hemma', 'kvall', 'avslut'] as const;
export type Section = (typeof SECTIONS)[number];

/**
 * Vilka delar rapporten har. `BRIEFING="vader,tag,forsta,hemresa,bil,hemma,kvall,avslut"` (valfri delmängd, i den ordningen
 * delarna alltid läses) styr; utan värdet väljs delar efter vad hushållet har: väder, tåg/första händelse/hemresa för
 * den som pendlar med tåg, bil för den som kör, hemmet, kvällens händelser och avslut för alla.
 */
export function sectionsOn(raw: string | undefined, has: { vader: boolean; tag: boolean; pendlar: boolean; bil: boolean; hemma?: boolean }): Set<Section> {
  const listed = (raw ?? '').split(',').map((s) => s.trim().toLowerCase()).filter((s): s is Section => (SECTIONS as readonly string[]).includes(s));
  if (listed.length) return new Set(listed);
  return new Set<Section>([...(has.vader ? ['vader' as const] : []), ...(has.tag ? ['tag' as const] : []),
    ...(has.pendlar ? ['forsta' as const, 'hemresa' as const] : []), ...(has.bil ? ['bil' as const] : []), ...(has.hemma ? ['hemma' as const] : []), 'kvall', 'avslut']);
}

type Ev = { id: string; title: string; start: number | null; end: number | null };
/**
 * Dagens läge ur kalendern (idag, tidsatta händelser): första kommande händelsen ("första" om inget redan börjat, annars
 * "nästa"; "Möten på jobbet" heter möte), när sista mötet slutar (om det är kvar) och kvällens händelser (från 16, inte
 * jobbmötena).
 */
export function todayPlan(events: Ev[], now: number): { first: { title: string; start: number; next: boolean; meetings: boolean } | null; lastEnd: number | null; evening: { title: string; start: number }[] } {
  const timed = events.filter((e): e is Ev & { start: number } => e.start != null).sort((a, b) => a.start - b.start);
  const upcoming = timed.find((e) => e.start > now);
  const meetings = timed.find((e) => e.id.startsWith('jobb@'));
  return {
    first: upcoming ? { title: upcoming.title, start: upcoming.start, next: timed[0] !== upcoming, meetings: upcoming.id.startsWith('jobb@') } : null,
    lastEnd: meetings?.end != null && meetings.end > now ? meetings.end : null,
    evening: timed.filter((e) => e.start > now && stockholm(e.start).hour >= 16 && !e.id.startsWith('jobb@')).map((e) => ({ title: e.title, start: e.start })),
  };
}


// ---- Hemmet ----
export type HomeInput = {
  /** Dashboardens person (förnamn): "du" i texten. */ me: string;
  lightsOn: number; lightsTotal: number; tempAvg: number | null;
  /** Förnamn och om personen är hemma. */ people: { name: string; present: boolean }[];
  internet: 'ok' | 'slow' | 'down' | 'unknown' | null;
  /** Finns fuktsensorer, och vilka rum som har hög fukt. */ humidity: { measured: boolean; damp: string[] };
  /** Enheter med lågt batteri (färdiga namn); null = inga batterienheter finns. */ batteries: string[] | null;
};

/** Vem en klocka tillhör: "din klocka", "Ulrikas klocka"; andra enheter med sitt namn. */
export function batteryLabel(deviceName: string, me: string, others: string[] = []): string {
  const name = deviceName.trim();
  if (!/apple watch|klocka|\bwatch\b/i.test(name)) return name;
  const owner = [me, ...others].find((n) => n && name.toLowerCase().includes(n.toLowerCase()));
  return !owner ? 'en klocka' : owner.toLowerCase() === me.toLowerCase() ? 'din klocka' : `${owner.charAt(0).toUpperCase()}${owner.slice(1).toLowerCase()}s klocka`;
}

/** Hemmet i korta meningar: lampor och snittemperatur, vilka som är hemma, och internet, fukt och larm. Delar utan data hoppas över. */
export function homeSentences(i: HomeInput): string[] {
  const out: string[] = [];
  const lamps = i.lightsTotal > 0 ? (i.lightsOn === 0 ? 'är alla lampor släckta' : `lyser ${i.lightsOn === 1 ? 'en lampa' : `${cnt(i.lightsOn)} lampor`}`) : null;
  const t = i.tempAvg != null ? Math.round(i.tempAvg) : null;
  const deg = t != null ? `${cnt(t)} ${t === 1 ? 'grad' : 'grader'} i snitt` : null;
  if (lamps || deg) out.push(`Hemma ${lamps ?? ''}${lamps && deg ? ' och det är ' : deg ? 'är det ' : ''}${deg ?? ''}.`.replace(/\s+/g, ' ').replace(' .', '.'));
  if (i.people.length) {
    const home = i.people.filter((p) => p.present).map((p) => p.name);
    const others = home.filter((n) => n.toLowerCase() !== i.me.toLowerCase());
    const you = home.length > others.length;
    out.push(home.length ? `${joinList([...others, ...(you ? ['du'] : [])]).replace(/^du$/, 'Du')} är hemma.` : 'Ingen är hemma.');
  }
  const status = [
    i.internet === 'ok' ? 'Internet: check' : i.internet === 'slow' ? 'Internet: långsamt' : i.internet === 'down' ? 'Internet: nere' : null,
    i.humidity.measured ? (i.humidity.damp.length ? `Fukt: hög fukt i ${joinList(i.humidity.damp)}` : 'Fukt: check') : null,
    i.batteries ? (i.batteries.length === 0 ? 'Larm: check' : `Larm: dåligt batteri i ${i.batteries.length > 2 ? `${cnt(i.batteries.length)} enheter` : joinList(i.batteries)}`) : null,
  ].filter(Boolean);
  if (status.length) out.push(`${status.join(', ')}.`);
  return out;
}

export type BriefingInput = {
  /** Nästa tåg: planerad avgång, förseningen i minuter och när man behöver gå. */ train?: { dep: number; delay: number; leave: number } | null;
  first?: { title: string; start: number; next: boolean; meetings: boolean } | null;
  /** Sista mötet slutar. */ lastEnd?: number | null;
  /** Hemresan efter sista mötet: tågets avgång (om tåg ingår) och när man är hemma. */ homePlan?: { trainDep: number | null; home: number } | null;
  car?: { home: boolean; label: string; minutes: number; trafficMin: number; warnings: number } | null;
  evening?: { title: string; start: number }[];
  home?: HomeInput | null;
  /** Nu och egna avslutsord; utan `now` blir avslutet dagens. */ now?: number; closings?: Partial<Record<DayPart, string>>;
};

/** Rapportens meningar efter första meningen, i fast ordning; delar utan data hoppas över. */
export function briefingParts(i: BriefingInput, on: Set<Section>): string[] {
  const out: string[] = [];
  if (on.has('tag') && i.train) {
    const t = spokenTime(i.train.dep), go = spokenTime(i.train.leave);
    out.push(i.train.delay >= 1 ? `Tåget ${t} är ${minutes(i.train.delay)} försenat, så du bör gå ${go} för att hinna i tid.` : `Tåget ${t} går i tid, så du bör gå ${go}.`);
  }
  if (on.has('forsta') && i.first) {
    out.push(`${i.first.next ? 'Din nästa' : 'Din första'} kalenderhändelse är ${i.first.meetings ? 'möte' : spokenTitle(i.first.title)} klockan ${spokenTime(i.first.start)}.`);
  }
  if (on.has('hemresa') && i.lastEnd != null) {
    const home = i.homePlan;
    out.push(`Ditt sista möte för dagen slutar ${spokenTime(i.lastEnd)}${home ? `${home.trainDep != null ? `, så du borde hinna med tåget ${spokenTime(home.trainDep)}` : ''}, då är du hemma ${spokenTime(home.home)}` : ''}.`);
  }
  if (on.has('bil') && i.car) {
    const c = i.car, w = c.warnings;
    const where = c.home ? 'hem' : `till ${c.label === 'Jobbet' ? 'jobbet' : c.label}`;
    const warn = w > 0 ? `, det finns ${w === 1 ? 'en vägvarning' : `${cnt(w)} vägvarningar`} för resan` : '';
    const delay = c.trafficMin > 0 ? (w > 0 ? `, ${w === 1 ? 'den' : 'de'} påverkar restiden med ${minutes(c.trafficMin)}` : `, trafiken ger ${minutes(c.trafficMin)} längre restid`) : '';
    out.push(`Resan ${where} ser ut att ta ${minutes(c.minutes)}${warn}${delay}.`);
  }
  if (on.has('hemma') && i.home) out.push(...homeSentences(i.home));
  if (on.has('kvall') && i.evening?.length) {
    // Matcher får egna meningar: "Ikväll klockan nitton är det match mellan A och B." Övriga i en lista: "Ikväll har X klockan …".
    const games = i.evening.filter((e) => matchOf(e.title)), rest = i.evening.filter((e) => !matchOf(e.title));
    if (rest.length) out.push(`Ikväll har ${joinList(rest.map((e) => `${e.title} klockan ${spokenTime(e.start)}`))}.`);
    games.forEach((g, k) => { const [a, b] = matchOf(g.title)!; out.push(`${k === 0 && !rest.length ? 'Ikväll klockan' : 'Klockan'} ${spokenTime(g.start)} är det match mellan ${a} och ${b}.`); });
  }
  if (on.has('avslut')) out.push(i.now == null ? (i.closings?.dag ?? CLOSING.dag) : closing(i.now, i.closings));
  return out;
}

/**
 * Delar texten i meningar (högst `max` tecken, annars delat vid komma eller mellanslag). Långa yttranden klipps av
 * efter cirka 15 sekunder i flera webbläsare, så de läses upp ett i taget.
 */
export function speechChunks(text: string, max = 200): string[] {
  const out: string[] = [];
  for (const s of text.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean)) {
    let rest = s;
    while (rest.length > max) {
      const cut = Math.max(rest.lastIndexOf(', ', max), rest.lastIndexOf(' ', max));
      const at = cut > max / 2 ? cut + 1 : max;
      out.push(rest.slice(0, at).trim());
      rest = rest.slice(at).trim();
    }
    if (rest) out.push(rest);
  }
  return out;
}

type VoiceInfo = { name: string; lang: string };
/** Bästa svenska rösten: förbättrad/neural/premium först, sedan någon svensk. Null om ingen svensk röst finns (webbläsaren väljer då själv utifrån sv-SE). */
export function pickVoice<T extends VoiceInfo>(voices: T[]): T | null {
  const sv = voices.filter((v) => /^sv([-_]|$)/i.test(v.lang));
  return sv.find((v) => /premium|enhanced|förbättrad|neural|natural|online|siri/i.test(v.name)) ?? sv[0] ?? null;
}
