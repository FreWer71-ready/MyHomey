// Varningar: SMHI:s vädervarningar (gul/orange/röd), VMA via Krisinformation och kommande oväder
// ur prognosen. Ren logik; hämtningen görs i data.ts.
import type { WeatherHour } from './weather';

export type Level = 'yellow' | 'orange' | 'red';
export type SmhiWarning = { id: string; level: Level; event: string; area: string; start: number | null; end: number | null; text: string | null };
export type Vma = { id: string; headline: string; text: string; area: string; published: number; url: string | null };
export type Storm = { kind: 'gust' | 'thunder' | 'rain' | 'snow'; label: string; at: number };

const LEVELS: Record<string, Level> = { YELLOW: 'yellow', ORANGE: 'orange', RED: 'red' };
const RANK: Record<Level, number> = { red: 0, orange: 1, yellow: 2 };

type SmhiJson = {
  id: number;
  event?: { sv?: string };
  warningAreas?: {
    id: number; approximateStart?: string; approximateEnd?: string;
    areaName?: { sv?: string }; warningLevel?: { code?: string }; eventDescription?: { sv?: string };
    affectedAreas?: { sv?: string }[];
    descriptions?: { title?: { code?: string }; text?: { sv?: string } }[];
  }[];
}[];

/** SMHI-varningar (gul och uppåt) som berör området, t.ex. /Södermanland|Eskilstuna/i. Allvarligast först. */
export function smhiWarnings(json: SmhiJson, area: RegExp, now = Date.now()): SmhiWarning[] {
  const out: SmhiWarning[] = [];
  for (const w of json ?? []) {
    for (const a of w.warningAreas ?? []) {
      const level = LEVELS[a.warningLevel?.code ?? ''];
      const names = [a.areaName?.sv, ...(a.affectedAreas ?? []).map((x) => x.sv)].filter(Boolean).join(', ');
      const end = a.approximateEnd ? Date.parse(a.approximateEnd) : null;
      if (!level || !area.test(names) || (end !== null && end < now)) continue;
      out.push({
        id: `${w.id}-${a.id}`, level,
        event: a.eventDescription?.sv ?? w.event?.sv ?? 'Varning',
        area: a.areaName?.sv ?? names,
        start: a.approximateStart ? Date.parse(a.approximateStart) : null, end,
        text: a.descriptions?.find((d) => d.title?.code === 'INCIDENT')?.text?.sv ?? null,
      });
    }
  }
  return out.sort((x, y) => RANK[x.level] - RANK[y.level] || (x.start ?? 0) - (y.start ?? 0));
}

type VmaJson = { Identifier?: string; Headline?: string; Preamble?: string; BodyText?: string; Published?: string; Web?: string; Area?: { Type?: string; Description?: string }[] }[];

/** VMA som gäller området eller hela landet. */
export function vmas(json: VmaJson, area: RegExp): Vma[] {
  return (json ?? [])
    .filter((v) => (v.Area ?? []).some((a) => area.test(a.Description ?? '') || /sverige|hela landet/i.test(a.Description ?? '') || a.Type === 'Country'))
    .map((v) => ({
      id: v.Identifier ?? v.Headline ?? '',
      headline: v.Headline ?? 'Viktigt meddelande till allmänheten',
      text: v.Preamble || v.BodyText || '',
      area: (v.Area ?? []).map((a) => a.Description).filter(Boolean).join(', '),
      published: v.Published ? Date.parse(v.Published) : Date.now(),
      url: v.Web ?? null,
    }));
}

/** Kommande oväder inom 24 h ur prognosen: hårda byar, åska, kraftigt regn/snöfall (första tillfället per sort). */
export function storms(hours: (WeatherHour & { gust?: number })[], now = Date.now()): Storm[] {
  const soon = hours.filter((h) => h.time + 3600_000 > now && h.time < now + 24 * 3600_000);
  const first = (pred: (h: WeatherHour & { gust?: number }) => boolean) => soon.find(pred);
  const out: Storm[] = [];
  const gust = first((h) => (h.gust ?? 0) >= 15);
  if (gust) out.push({ kind: 'gust', label: `Hårda vindbyar ${Math.round(gust.gust!)} m/s`, at: gust.time });
  const thunder = first((h) => (h.thunder ?? 0) >= 0.3 || /thunder/.test(h.symbol));
  if (thunder) out.push({ kind: 'thunder', label: 'Risk för åska', at: thunder.time });
  const snow = first((h) => /snow/.test(h.symbol) && h.precip >= 2);
  const rain = first((h) => !/snow/.test(h.symbol) && h.precip >= 4);
  if (snow) out.push({ kind: 'snow', label: `Kraftigt snöfall ${snow.precip.toLocaleString('sv-SE', { maximumFractionDigits: 1 })} mm/h`, at: snow.time });
  if (rain) out.push({ kind: 'rain', label: `Kraftigt regn ${rain.precip.toLocaleString('sv-SE', { maximumFractionDigits: 1 })} mm/h`, at: rain.time });
  return out.sort((a, b) => a.at - b.at);
}
