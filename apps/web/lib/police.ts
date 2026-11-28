// Händelser i närheten från Polisens öppna API (polisen.se/api/events). Ren tolkning; testas i police.test.ts.
// Ortsnamnet står sist i "name" ("13 november 21.51, Trafikolycka, singel, Eskilstuna"); location är ofta bara länet.

export type RawPolice = { id: number; datetime: string; name: string; summary: string; url: string; type: string; location?: { name?: string } };
export type PoliceEvent = { id: number; at: number; type: string; place: string; summary: string; url: string; level: 'red' | 'orange' | 'yellow' };

/** Sammanfattningar och rena uppdateringar är inga händelser. */
const SKIP = /^(sammanfattning|övrigt|uppdatering|nyheter|presstalesperson|polisinsats\/kommendering)/i;
const RED = /skottlossning|explosion|mord|dråp|bombhot|vma/i;
const ORANGE = /brand|räddningsinsats|trafikolycka|farligt föremål|rån|knivlagen|olaga hot|försvunnen|gasläcka/i;

/** "2026-11-14 7:54:42 +01:00" → ms. */
/** Kommuner som ett ortnamn står för: polisen anger ibland tätorten (Torshälla) i stället för kommunen. */
export const KOMMUN: Record<string, string[]> = {
  eskilstuna: ['Eskilstuna', 'Torshälla', 'Kvicksund', 'Hällbybrunn', 'Ärla', 'Skogstorp', 'Alberga', 'Hällberga', 'Sundbyholm'],
};

/** "Eskilstuna" → Eskilstuna kommuns alla tätorter; övriga namn som de är. Utan dubbletter. */
export const expandAreas = (areas: string[]) => [...new Set(areas.flatMap((a) => KOMMUN[a.trim().toLowerCase()] ?? [a.trim()]))];

/** Rubrik: "Eskilstuna kommun" för en kommun i KOMMUN, annars namnet. */
export const areaLabel = (areas: string[]) => areas.map((a) => (KOMMUN[a.trim().toLowerCase()] ? `${a.trim()} kommun` : a.trim())).join(', ');

export function policeTime(s: string): number {
  const m = s.match(/^(\d{4}-\d{2}-\d{2}) (\d{1,2}):(\d{2}):(\d{2}) ([+-]\d{2}:\d{2})$/);
  return m ? Date.parse(`${m[1]}T${m[2].padStart(2, '0')}:${m[3]}:${m[4]}${m[5]}`) : NaN;
}

export function parsePolice(raw: RawPolice[], areas: string[], now = Date.now(), hours = 24): PoliceEvent[] {
  const want = new Set(areas.map((a) => a.trim().toLowerCase()).filter(Boolean));
  return raw
    .map((r) => {
      const place = r.name.split(',').at(-1)?.trim() ?? '';
      const type = r.type.trim();
      return {
        id: r.id, at: policeTime(r.datetime), type, place, summary: r.summary.trim(),
        url: `https://polisen.se${r.url}`,
        level: RED.test(type) ? 'red' : ORANGE.test(type) ? 'orange' : 'yellow',
      } as PoliceEvent;
    })
    .filter((e) => Number.isFinite(e.at) && now - e.at <= hours * 3600_000 && !SKIP.test(e.type) && (!want.size || want.has(e.place.toLowerCase())))
    .sort((a, b) => b.at - a.at);
}

/** Det som är värt en varning på Hem: allvarligt (röd/orange) och färskt (senaste `hours` timmarna), allvarligast och nyast först. */
export function policeAlerts(events: PoliceEvent[], now = Date.now(), hours = 3) {
  const rank = { red: 0, orange: 1, yellow: 2 };
  return events.filter((e) => e.level !== 'yellow' && now - e.at <= hours * 3600_000).sort((a, b) => rank[a.level] - rank[b.level] || b.at - a.at);
}
