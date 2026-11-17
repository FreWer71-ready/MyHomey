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
type V = { Value?: number };
export type RawStation = {
  Id?: string; Name?: string;
  Observation?: {
    Sample?: string; Air?: { Temperature?: V; Dewpoint?: V; RelativeHumidity?: V }; Surface?: { Temperature?: V };
    Weather?: { Precipitation?: string }; Wind?: { Speed?: V; Direction?: V }[]; Aggregated10minutes?: { Wind?: { SpeedMax?: V } };
    Aggregated30minutes?: { Precipitation?: { Rain?: boolean; Snow?: boolean } };
  };
};
export type RawCommute = {
  out: RawTrain[]; home: RawTrain[]; all?: RawTrain[]; arrivals: RawArrival[]; situations: { Deviation?: RawDeviation[] }[];
  station?: RawStation | null; stations?: RawStation[]; fetched?: string;
};

/** Vägväderstation (Trafikverket VViS) direkt från API:t: samma värden som Homey-appens station. */
export type RoadStation = {
  name: string; air: number | null; road: number | null; wind: number | null; gust: number | null; deg: number | null; at: number;
  id?: string; dew?: number | null; rh?: number | null; rain?: boolean; snow?: boolean;
};
/** Äldre än så här räknas stationen som ej tillgänglig (samma gräns som Homey-stationen). */
const STATION_MAX_H = 4;

export function parseStation(s: RawStation | null | undefined, now = Date.now()): RoadStation | null {
  const o = s?.Observation;
  const at = o?.Sample ? Date.parse(o.Sample) : NaN;
  if (!o || !Number.isFinite(at) || now - at > STATION_MAX_H * 3600_000) return null;
  const n = (v?: V) => (typeof v?.Value === 'number' ? v.Value : null);
  const w = o.Wind?.[0];
  const base: RoadStation = { name: s?.Name ?? 'Väderstation', air: n(o.Air?.Temperature), road: n(o.Surface?.Temperature), wind: n(w?.Speed), gust: n(o.Aggregated10minutes?.Wind?.SpeedMax), deg: n(w?.Direction), at };
  if (!s?.Id) return base;
  const p = o.Aggregated30minutes?.Precipitation;
  const now30 = (o.Weather?.Precipitation ?? 'no').toLowerCase();
  return {
    ...base, id: s.Id, dew: n(o.Air?.Dewpoint), rh: n(o.Air?.RelativeHumidity),
    rain: !!p?.Rain || /rain|drizzle|regn/.test(now30), snow: !!p?.Snow || /snow|sleet|snö/.test(now30),
  };
}

/** Vägväderstationer på pendlingen, i körordning. NEAR = nära hemmet (medel i Ute-kortet). */
export const ROUTE_STATIONS = ['429', '418', '1903', '1924'];
export const NEAR_STATIONS = ['429', '418'];

/**
 * Halka per station: 'bad' = vägbanan under 0° och fukt (nederbörd eller rimfrost: vägen kallare än daggpunkten),
 * 'warn' = vägbanan 0,5° eller kallare, eller tidig varning: högst +2° och fuktig
 * (nederbörd eller vägen högst 0,5° över daggpunkten), annars null.
 */
export function slip(s: RoadStation): Tone | null {
  if (s.road == null) return null;
  const wet = !!s.rain || !!s.snow || (s.dew != null && s.road <= s.dew);
  if (s.road <= 0 && wet) return 'bad';
  if (s.road <= 0.5) return 'warn';
  const damp = !!s.rain || !!s.snow || (s.dew != null && s.road <= s.dew + 0.5);
  return s.road <= 2 && damp ? 'warn' : null;
}

/** Medel av stationerna nära hemmet (luft, väg, vind); byar = högsta. Riktning från den första. */
export function nearAverage(list: RoadStation[]): RoadStation | null {
  const near = list.filter((s) => s.id && NEAR_STATIONS.includes(s.id));
  if (!near.length) return null;
  const avg = (k: 'air' | 'road' | 'wind' | 'dew') => {
    const v = near.map((s) => s[k]).filter((x): x is number => typeof x === 'number');
    return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
  };
  const gusts = near.map((s) => s.gust).filter((x): x is number => typeof x === 'number');
  return {
    name: near.length > 1 ? `medel ${near.map((s) => s.name).join(' & ')}` : near[0].name,
    air: avg('air'), road: avg('road'), wind: avg('wind'), gust: gusts.length ? Math.max(...gusts) : null,
    deg: near.find((s) => s.deg != null)?.deg ?? null, at: Math.min(...near.map((s) => s.at)),
    dew: avg('dew'), rain: near.some((s) => s.rain), snow: near.some((s) => s.snow),
  };
}

export type Train = {
  id: string; ident: string; dep: number; est: number | null; delay: number; canceled: boolean; track: string | null;
  dest: string; arr: number | null; notes: string[]; product: string | null;
};
export type RoadEvent = {
  id: string; road: string; type: string; code: string; incident: boolean; text: string | null; place: string | null; severity: number;
  severityText: string | null; start: number | null; end: number | null;
  /** Position (WGS84) om Trafikverket anger en. */
  lat?: number; lon?: number;
};
/** trains=false: bara väg (COMMUTE=road), t.ex. hushåll som inte pendlar med tåg. */
export type Commute = {
  out: Train[]; home: Train[]; /** Alla avgångar från Eskilstuna C, alla riktningar. */ all: Train[]; road: RoadEvent[];
  /** Ute-kortet: medel av stationerna nära hemmet (annars Eskilstuna Ö). */ station: RoadStation | null;
  /** Vägväderstationer längs bilvägen, i körordning. */ stations: RoadStation[]; fetched: number; trains: boolean };

/** Signaturer som syns som slutstation på sträckan. Okända visas som de är. */
export const STATIONS: Record<string, string> = {
  Et: 'Eskilstuna C', Cst: 'Stockholm C', U: 'Uppsala C', Arnc: 'Arlanda C', Arb: 'Arboga', Öb: 'Örebro C', Hpbg: 'Hallsberg',
  Söö: 'Södertälje Syd', Sgs: 'Strängnäs', Lg: 'Läggesta', Kp: 'Köping', Vå: 'Västerås C', K: 'Kungsör', Gä: 'Gävle C',
  Fv: 'Flen', Kat: 'Katrineholm C', Hgl: 'Hagalund', Sci: 'Stockholm City', Mr: 'Mariefred', Kh: 'Karlstad C',
  Lp: 'Linköping C', Nk: 'Nyköping C', Nr: 'Norrköping C', G: 'Göteborg C',
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

const point = (d: RawDeviation) => {
  const m = d.Geometry?.Point?.WGS84?.match(/POINT \(([\d.]+) ([\d.]+)\)/);
  return m ? { lon: Number(m[1]), lat: Number(m[2]) } : null;
};

function inBox(d: RawDeviation) {
  const box = BOXES[d.RoadNumberNumeric ?? 56];
  if (!box) return false;
  const p = point(d);
  if (!p) return d.RoadNumberNumeric !== 18; // E18 utan position kan ligga var som helst
  const { lon, lat } = p;
  return lat >= box.lat[0] && lat <= box.lat[1] && lon >= box.lon[0] && lon <= box.lon[1];
}

/**
 * En händelse per situation: den allvarligaste avvikelsen. Pausade och de utan påverkan tas bort; incidenter först.
 * keep väljer avvikelser (pendling: väg 56/E18 inom sträckan; område: alla med position).
 */
export function parseRoad(raw: RawCommute['situations'], now: number, keep: (d: RawDeviation) => boolean = inBox): RoadEvent[] {
  const out: RoadEvent[] = [];
  for (const s of raw ?? []) {
    const devs = (s.Deviation ?? []).filter((d) => !d.Suspended && keep(d) && (t(d.EndTime) ?? Infinity) > now && (t(d.StartTime) ?? 0) <= now + 24 * 3600_000);
    if (!devs.length) continue;
    const d = [...devs].sort((a, b) => (b.SeverityCode ?? 0) - (a.SeverityCode ?? 0) || Number(!!b.Message) - Number(!!a.Message))[0];
    // Ärenden utan påverkan (vägarbete m.m. med påverkan 0–1) tillför inget och hoppas över. Incidenter visas alltid.
    if (PLANNED.test(d.MessageTypeValue ?? '') && Math.max(...devs.map((x) => x.SeverityCode ?? 0)) <= 1) continue;
    out.push({
      id: d.Id ?? `${out.length}`,
      road: d.RoadNumber ?? (d.RoadNumberNumeric === 18 ? 'E18' : `Väg ${d.RoadNumberNumeric ?? 56}`),
      type: d.MessageType ?? 'Händelse',
      code: d.MessageTypeValue ?? '',
      incident: !PLANNED.test(d.MessageTypeValue ?? ''),
      text: d.Message?.replace(/\s+/g, ' ').replace(/\.\s*$/, '').trim() || null,
      place: d.LocationDescriptor && d.LocationDescriptor !== 'Sverige' ? d.LocationDescriptor : null,
      severity: Math.max(...devs.map((x) => x.SeverityCode ?? 0)),
      severityText: d.SeverityText ?? null,
      start: t(d.StartTime),
      end: t(d.EndTime),
      ...(point(d) ?? {}),
    });
  }
  const rank = { bad: 0, warn: 1, ok: 2 } as const;
  return out.sort((a, b) => rank[roadTone(a, now)] - rank[roadTone(b, now)] || Number(b.incident) - Number(a.incident) || b.severity - a.severity);
}

/** max = antal avgångar per riktning som sparas (vyerna visar själva färre: Hem 4, Pendling 4 eller fler). */
export function parseCommute(raw: RawCommute, from = 'Et', to = 'Cst', now = Date.now(), max = 30): Commute {
  return {
    out: trains(raw.out ?? [], raw.arrivals ?? [], to, now, max),
    home: trains(raw.home ?? [], raw.arrivals ?? [], from, now, max),
    all: trains(raw.all ?? [], [], '', now, 60),
    road: parseRoad(raw.situations, now),
    ...(() => {
      const list = ROUTE_STATIONS.map((id) => parseStation((raw.stations ?? []).find((x) => x.Id === id), now)).filter((x): x is RoadStation => !!x);
      return { stations: list, station: nearAverage(list) ?? parseStation(raw.station, now) };
    })(),
    fetched: t(raw.fetched) ?? now,
    trains: true,
  };
}

/** Morgon (före 12 svensk tid) och söndagar: mot Stockholm. Annars hemåt. */
export function direction(now = Date.now()): 'out' | 'home' {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Stockholm', weekday: 'short', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const h = Number(f.find((x) => x.type === 'hour')?.value);
  // Söndag: inga resor hem från jobbet, visa morgondagens tåg mot Stockholm.
  if (f.find((x) => x.type === 'weekday')?.value === 'Sun') return 'out';
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
  // Halka längs bilvägen (vägväderstationerna): ett kort, rött om någon station har halt väglag.
  const slips = (c.stations ?? []).map((s) => ({ s, tone: slip(s) })).filter((x) => x.tone);
  if (slips.length) {
    const fmtT = (v: number) => `${v.toLocaleString('sv-SE', { maximumFractionDigits: 1 })}°`;
    out.push({
      id: `halka-${slips.map((x) => `${x.s.id}${x.tone}`).join('-')}`, kind: 'road', tone: slips.some((x) => x.tone === 'bad') ? 'bad' : 'warn',
      label: `Risk för halka: ${slips.slice(0, 3).map((x) => `${x.s.name} ${fmtT(x.s.road!)}`).join(', ')}`,
    });
  }
  const inc = c.road.filter((r) => r.incident && (r.severity >= 3 || /Accident|Obstruction|Closure|Restriction/i.test(r.code)));
  if (inc.length) {
    const roads = [...new Set(inc.map((r) => r.road))].join(' & ');
    const first = inc[0];
    out.push({
      // Samma bedömning som pendlingskortet: "Stor påverkan" (roadTone = bad) ger röd varning, annars orange.
      id: `vag-${inc.map((r) => r.id).join('-')}`, kind: 'road', tone: inc.some((r) => roadTone(r, now) === 'bad') ? 'bad' : 'warn',
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

// ---- Fokus på nästa avgång -------------------------------------------------
/** Ett tåg som går inom så här många minuter lyfts fram med större text och nedräkning. */
export const FOCUS_MIN = 45;

/** Tiden att räkna mot: beräknad avgång om den finns, annars tidtabellen. */
export const departsAt = (t: Train) => t.est ?? t.dep;

/**
 * Nästa tåg som inte är inställt och går inom FOCUS_MIN minuter. Ett tåg som just har gått
 * (mer än 30 s sedan) räknas inte, eftersom listan bara hämtas om med några minuters mellanrum.
 */
export function focusTrain(list: Train[], now = Date.now(), windowMin = FOCUS_MIN): Train | null {
  return list.find((t) => !t.canceled && departsAt(t) >= now - 30_000 && departsAt(t) - now <= windowMin * 60_000) ?? null;
}

/** Nedräkning till avgång: "42 min", under 10 minuter "9:05" (min:sek), vid avgång "Nu". */
export function countdown(ms: number): string {
  if (ms <= 0) return 'Nu';
  if (ms < 10 * 60_000) {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
  return `${Math.floor(ms / 60_000)} min`;
}

/** Färg på nedräkningen: lugn över 10 min, gul 3–10 min, röd under 3 min. */
export function countdownTone(ms: number): Tone {
  if (ms < 3 * 60_000) return 'bad';
  return ms < 10 * 60_000 ? 'warn' : 'ok';
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
