// Pendling: tåg Eskilstuna C <-> Stockholm C och händelser på bilvägen Eskilstuna–Västerås (väg 56 + E18).
// Rådata från edge-funktionen trafik (Trafikverket); här är bara ren logik.

type Loc = { LocationName: string };
export type RawTrain = {
  AdvertisedTrainIdent: string; AdvertisedTimeAtLocation: string; EstimatedTimeAtLocation?: string; TimeAtLocation?: string;
  Canceled?: boolean; Deviation?: { Code?: string; Description?: string }[]; ToLocation?: Loc[]; TrackAtLocation?: string;
  LocationSignature: string; ProductInformation?: { Description?: string }[];
};
export type RawArrival = { AdvertisedTrainIdent: string; LocationSignature: string; AdvertisedTimeAtLocation: string; EstimatedTimeAtLocation?: string };
export type RawDeviation = {
  Id?: string; Message?: string; MessageType?: string; MessageTypeValue?: string; LocationDescriptor?: string;
  RoadNumber?: string; RoadNumberNumeric?: number; SeverityCode?: number; SeverityText?: string; StartTime?: string; EndTime?: string; Suspended?: boolean;
  Geometry?: { Point?: { WGS84?: string } };
};
export type RawCommute = { out: RawTrain[]; home: RawTrain[]; arrivals: RawArrival[]; situations: { Deviation?: RawDeviation[] }[]; fetched?: string };

export type Train = {
  id: string; ident: string; dep: number; est: number | null; delay: number; canceled: boolean; track: string | null;
  dest: string; arr: number | null; notes: string[]; product: string | null;
};
export type RoadEvent = {
  id: string; road: string; type: string; code: string; incident: boolean; text: string | null; place: string | null; severity: number;
  severityText: string | null; start: number | null; end: number | null;
};
export type Commute = { out: Train[]; home: Train[]; road: RoadEvent[]; fetched: number };

/** Signaturer som syns som slutstation på sträckan. Okända visas som de är. */
export const STATIONS: Record<string, string> = {
  Et: 'Eskilstuna C', Cst: 'Stockholm C', U: 'Uppsala C', Arnc: 'Arlanda C', Arb: 'Arboga', Öb: 'Örebro C', Hpbg: 'Hallsberg',
  Söö: 'Södertälje Syd', Sgs: 'Strängnäs', Lg: 'Läggesta', Kp: 'Köping', Vå: 'Västerås C', K: 'Kungsör', Gä: 'Gävle C',
  Fv: 'Flen', Kat: 'Katrineholm C', Hgl: 'Hagalund', Sci: 'Stockholm City', Mr: 'Mariefred', Kh: 'Karlstad C',
};
export const station = (sig: string) => STATIONS[sig] ?? sig;

/** Bilvägen Eskilstuna–Västerås: väg 56 till E18, sedan E18 in mot Västerås. Händelser utanför rutorna räknas inte. */
const BOXES: Record<number, { lat: [number, number]; lon: [number, number] }> = {
  56: { lat: [59.3, 59.64], lon: [16.1, 16.8] },
  18: { lat: [59.55, 59.66], lon: [16.3, 16.65] },
};
/** Långvariga typer (vägarbete m.m.) som inte larmar på startsidan. */
const PLANNED = /MaintenanceWorks|RoadOrCarriagewayOrLaneManagement|SpeedManagement|Roadworks|ConstructionWorks/i;

const t = (s?: string) => (s ? Date.parse(s) : null);

function trains(raw: RawTrain[], arrivals: RawArrival[], to: string, now: number, max: number): Train[] {
  return raw
    .map((r) => {
      const dep = Date.parse(r.AdvertisedTimeAtLocation);
      const est = t(r.EstimatedTimeAtLocation);
      const a = arrivals.find((x) => x.AdvertisedTrainIdent === r.AdvertisedTrainIdent && x.LocationSignature === to);
      return {
        gone: !!r.TimeAtLocation || (est ?? dep) < now - 60_000,
        train: {
          id: `${r.AdvertisedTrainIdent}-${r.LocationSignature}`, ident: r.AdvertisedTrainIdent, dep, est,
          delay: est ? Math.max(0, Math.round((est - dep) / 60_000)) : 0,
          canceled: !!r.Canceled, track: r.TrackAtLocation ?? null,
          dest: station(r.ToLocation?.[0]?.LocationName ?? to),
          arr: a ? (t(a.EstimatedTimeAtLocation) ?? Date.parse(a.AdvertisedTimeAtLocation)) : null,
          notes: [...new Set((r.Deviation ?? []).map((d) => d.Description?.trim()).filter((d): d is string => !!d && !/^(inställt|försenad|i tid)$/i.test(d)))],
          product: r.ProductInformation?.[0]?.Description ?? null,
        } satisfies Train,
      };
    })
    .filter((x) => !x.gone)
    .map((x) => x.train)
    .sort((a, b) => a.dep - b.dep)
    .slice(0, max);
}

function inBox(d: RawDeviation) {
  const box = BOXES[d.RoadNumberNumeric ?? 56];
  if (!box) return false;
  const m = d.Geometry?.Point?.WGS84?.match(/POINT \(([\d.]+) ([\d.]+)\)/);
  if (!m) return d.RoadNumberNumeric !== 18; // E18 utan position kan ligga var som helst
  const lon = Number(m[1]), lat = Number(m[2]);
  return lat >= box.lat[0] && lat <= box.lat[1] && lon >= box.lon[0] && lon <= box.lon[1];
}

/** En händelse per situation: den allvarligaste avvikelsen. Pausade och de utan påverkan tas bort; incidenter först. */
function road(raw: RawCommute['situations'], now: number): RoadEvent[] {
  const out: RoadEvent[] = [];
  for (const s of raw ?? []) {
    const devs = (s.Deviation ?? []).filter((d) => !d.Suspended && inBox(d) && (t(d.EndTime) ?? Infinity) > now && (t(d.StartTime) ?? 0) <= now + 24 * 3600_000);
    if (!devs.length) continue;
    const d = [...devs].sort((a, b) => (b.SeverityCode ?? 0) - (a.SeverityCode ?? 0) || Number(!!b.Message) - Number(!!a.Message))[0];
    // Ärenden utan påverkan (vägarbete m.m. med påverkan 0–1) tillför inget och hoppas över. Incidenter visas alltid.
    if (PLANNED.test(d.MessageTypeValue ?? '') && Math.max(...devs.map((x) => x.SeverityCode ?? 0)) <= 1) continue;
    out.push({
      id: d.Id ?? `${out.length}`,
      road: d.RoadNumber ?? (d.RoadNumberNumeric === 18 ? 'E18' : 'Väg 56'),
      type: d.MessageType ?? 'Händelse',
      code: d.MessageTypeValue ?? '',
      incident: !PLANNED.test(d.MessageTypeValue ?? ''),
      text: d.Message?.replace(/\s+/g, ' ').replace(/\.\s*$/, '').trim() || null,
      place: d.LocationDescriptor && d.LocationDescriptor !== 'Sverige' ? d.LocationDescriptor : null,
      severity: Math.max(...devs.map((x) => x.SeverityCode ?? 0)),
      severityText: d.SeverityText ?? null,
      start: t(d.StartTime),
      end: t(d.EndTime),
    });
  }
  const rank = { bad: 0, warn: 1, ok: 2 } as const;
  return out.sort((a, b) => rank[roadTone(a, now)] - rank[roadTone(b, now)] || Number(b.incident) - Number(a.incident) || b.severity - a.severity);
}

export function parseCommute(raw: RawCommute, from = 'Et', to = 'Cst', now = Date.now(), max = 6): Commute {
  return {
    out: trains(raw.out ?? [], raw.arrivals ?? [], to, now, max),
    home: trains(raw.home ?? [], raw.arrivals ?? [], from, now, max),
    road: road(raw.situations, now),
    fetched: t(raw.fetched) ?? now,
  };
}

/** Morgon (före 12 svensk tid): mot Stockholm. Annars hemåt. */
export function direction(now = Date.now()): 'out' | 'home' {
  const h = Number(new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', hourCycle: 'h23' }).format(now));
  return h < 12 ? 'out' : 'home';
}

export type CommuteAlert = { id: string; kind: 'train' | 'road'; tone: 'warn' | 'bad'; label: string };

/**
 * Sammanfattade störningar för startsidan, högst ett kort för tåg och ett för väg.
 * Tåg: inställda/försenade (≥10 min) inom 3 h i aktuell riktning (rött om något är inställt, annars gult).
 * Väg: incidenter (olycka, hinder, avstängning m.m.) på väg 56/E18. Detaljer finns på Pendling.
 */
export function commuteAlerts(c: Commute, now = Date.now(), fmt: (ms: number) => string): CommuteAlert[] {
  const dir = direction(now);
  const out: CommuteAlert[] = [];
  const bad = c[dir].filter((x) => x.dep < now + 3 * 3600_000 && (x.canceled || x.delay >= 10));
  if (bad.length) {
    const list = bad.slice(0, 3).map((x) => `${fmt(x.dep)} ${x.canceled ? 'inställt' : `+${x.delay} min`}`).join(', ');
    out.push({
      id: `tag-${bad.map((x) => x.id).join('-')}`, kind: 'train', tone: bad.some((x) => x.canceled) ? 'bad' : 'warn',
      label: `Tåg ${dir === 'out' ? 'mot Stockholm' : 'mot Eskilstuna'}: ${list}${bad.length > 3 ? ` + ${bad.length - 3} till` : ''}`,
    });
  }
  const inc = c.road.filter((r) => r.incident && (r.severity >= 3 || /Accident|Obstruction|Closure|Restriction/i.test(r.code)));
  if (inc.length) {
    const roads = [...new Set(inc.map((r) => r.road))].join(' & ');
    const first = inc[0];
    out.push({
      id: `vag-${inc.map((r) => r.id).join('-')}`, kind: 'road', tone: 'bad',
      label: `${roads}: ${first.type.toLowerCase()}${first.place ? ` · ${first.place}` : ''}${inc.length > 1 ? ` + ${inc.length - 1} till` : ''}`,
    });
  }
  return out;
}

/** Färgläge: grönt = i tid/ingen påverkan, gult = liten försening/påverkan, rött = stor. */
export type Tone = 'ok' | 'warn' | 'bad';
export const TONE_COLOR: Record<Tone, string> = { ok: '#12B76A', warn: '#E8B400', bad: '#F0503C' };

/** Tåg: inställt eller ≥10 min sent = rött, 3–9 min = gult, annars grönt. */
export function trainTone(t: Train): Tone {
  if (t.canceled || t.delay >= 10) return 'bad';
  return t.delay >= 3 ? 'warn' : 'ok';
}

/** Väg: incident eller pågående med stor påverkan (4–5) = rött; övrig påverkan eller kommande = gult; ingen påverkan = grönt. */
export function roadTone(r: RoadEvent, now = Date.now()): Tone {
  const active = (r.start ?? 0) <= now;
  if (active && (r.incident || r.severity >= 4)) return 'bad';
  return r.severity >= 2 || r.incident ? 'warn' : 'ok';
}

/** Statustext för tåg (färgen kommer från trainTone). */
export function trainStatus(t: Train) {
  return { text: t.canceled ? 'Inställt' : t.delay >= 3 ? `+${t.delay} min` : 'I tid', cls: 'bg-black/25 text-white' };
}

export type RoadGroup = { id: string; road: string; type: string; tone: Tone; count: number; severityText: string | null; places: string[]; texts: string[]; start: number | null; end: number | null };

/**
 * Slår ihop liknande vägärenden (samma väg, typ och färgläge) till ett kort för Pendling-sidan.
 * Platser och texter listas en gång var; perioden blir tidigaste start till senaste slut.
 */
export function groupRoad(list: RoadEvent[], now = Date.now()): RoadGroup[] {
  const map = new Map<string, RoadGroup>();
  for (const r of list) {
    const tone = roadTone(r, now);
    const key = `${r.road}|${r.type}|${tone}`;
    const g = map.get(key) ?? { id: r.id, road: r.road, type: r.type, tone, count: 0, severityText: r.severityText, places: [], texts: [], start: r.start, end: r.end };
    g.count++;
    if (r.place && !g.places.includes(r.place)) g.places.push(r.place);
    if (r.text && !g.texts.includes(r.text)) g.texts.push(r.text);
    if (r.start != null && (g.start == null || r.start < g.start)) g.start = r.start;
    if (r.end != null && (g.end == null || r.end > g.end)) g.end = r.end;
    map.set(key, g);
  }
  return [...map.values()];
}

/** Kortare platstext: "Väg 56 från Stora Ekeby till Kvicksund S båda riktningarna i Västmanlands län (U)" -> "Stora Ekeby – Kvicksund S". */
export function shortPlace(p: string): string {
  return p
    .replace(/^(väg \d+|e\d+|rv \d+)\s*/i, '')
    .replace(/[,\s]*(i )?(båda riktningar(na)?|en riktning|riktning [^,]*)/gi, '')
    .replace(/\s*i [\wåäö]+ län( \([A-ZÅÄÖ]+\))?/gi, '')
    .replace(/^från (.+?) till (.+)$/i, '$1 – $2')
    .replace(/^vid /i, '')
    .replace(/[.,\s]+$/, '')
    .trim();
}

/** Beskrivningar som korta fraser utan dubbletter: "Drift/underhåll\nEtt avstängt körfält. Risk för köbildning." -> 3 fraser. */
export function phrases(texts: string[]): string[] {
  return [...new Set(texts.flatMap((t) => t.split(/[.\n]+/)).map((x) => x.trim()).filter(Boolean))];
}
