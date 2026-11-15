// Eskilstuna kommuns driftinformation (eskilstuna.se/driftinformation): pågående avstängningar, grävarbeten m.m.
// Sidan bär listan som JSON i AppRegistry.registerInitialState(...). Ren tolkning; testas i municipal.test.ts.

export type RawHit = { id: string; url: string; title: string; startDate?: string; endDate?: string; tags?: { name: string; title: string }[] };
export type MuniItem = { id: string; title: string; url: string; start: number | null; end: number | null; area: string | null; mine: boolean };

const MONTHS = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
const TOPICS = new Set(['trafik', 'vägar', 'bygglov']);

/** "10 november 2026" → ms (lokal midnatt, Stockholm ≈ UTC+1/+2; dagsprecision räcker). */
export function svDate(s?: string): number | null {
  const m = s?.trim().toLowerCase().match(/^(\d{1,2}) ([a-zåäö]+) (\d{4})$/);
  const mon = m ? MONTHS.indexOf(m[2]) : -1;
  return m && mon >= 0 ? Date.UTC(Number(m[3]), mon, Number(m[1])) - 3600_000 : null;
}

/** Listan ur sidans HTML (tom om formatet ändrats). */
export function extractHits(html: string): RawHit[] {
  const m = html.match(/registerInitialState\('[^']+',(\{"filterOptions"[\s\S]*?\})\);/);
  try { return m ? ((JSON.parse(m[1]) as { hits?: RawHit[] }).hits ?? []) : []; } catch { return []; }
}

/**
 * Pågående ärenden, egna först: "mine" = områdestaggen (t.ex. munktellstaden-norr) eller ett ord i titeln (t.ex. Slagsta).
 * Slut räknas till och med slutdagen.
 */
export function toItems(hits: RawHit[], area: string | null, words: string[], now = Date.now()): MuniItem[] {
  const re = words.length ? new RegExp(words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i') : null;
  const seen = new Set<string>();
  return hits
    .filter((h) => !seen.has(h.id) && seen.add(h.id))
    .map((h) => {
      const areaTag = h.tags?.find((t) => !TOPICS.has(t.name));
      return {
        id: h.id, title: h.title.trim(), url: `https://www.eskilstuna.se${h.url}`,
        start: svDate(h.startDate), end: svDate(h.endDate), area: areaTag?.title ?? null,
        mine: (!!area && !!h.tags?.some((t) => t.name === area)) || (!!re && re.test(h.title)),
      };
    })
    .filter((x) => x.end == null || x.end + 86400_000 > now)
    .sort((a, b) => Number(b.mine) - Number(a.mine) || (b.start ?? 0) - (a.start ?? 0));
}
