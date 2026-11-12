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
  severityText: string | null; end: number | null;
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

/** En händelse per situation: den allvarligaste avvikelsen. Pausade (Suspended) tas bort; incidenter först. */
function road(raw: RawCommute['situations'], now: number): RoadEvent[] {
  const out: RoadEvent[] = [];
  for (const s of raw ?? []) {
    const devs = (s.Deviation ?? []).filter((d) => !d.Suspended && inBox(d) && (t(d.EndTime) ?? Infinity) > now && (t(d.StartTime) ?? 0) <= now + 24 * 3600_000);
    if (!devs.length) continue;
    const d = [...devs].sort((a, b) => (b.SeverityCode ?? 0) - (a.SeverityCode ?? 0) || Number(!!b.Message) - Number(!!a.Message))[0];
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
      end: t(d.EndTime),
    });
  }
  return out.sort((a, b) => Number(b.incident) - Number(a.incident) || b.severity - a.severity);
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

export type CommuteAlert = { id: string; kind: 'train' | 'road'; label: string };

/** Varningar för startsidan: inställda/försenade (≥10 min) tåg inom 3 h i aktuell riktning och incidenter på vägen. */
export function commuteAlerts(c: Commute, now = Date.now(), fmt: (ms: number) => string): CommuteAlert[] {
  const dir = direction(now);
  const soon = c[dir].filter((x) => x.dep < now + 3 * 3600_000);
  const train = soon.filter((x) => x.canceled || x.delay >= 10).slice(0, 2).map((x) => ({
    id: `tag-${x.id}`, kind: 'train' as const,
    label: `Tåg ${fmt(x.dep)} ${dir === 'out' ? 'mot Stockholm' : 'mot Eskilstuna'} ${x.canceled ? 'inställt' : `+${x.delay} min`}`,
  }));
  const roads = c.road.filter((r) => r.incident && (r.severity >= 3 || /Accident|Obstruction|Closure|Restriction/i.test(r.code))).slice(0, 1).map((r) => ({
    id: `vag-${r.id}`, kind: 'road' as const, label: `${r.road}: ${r.type.toLowerCase()}${r.place ? ` · ${r.place}` : ''}`,
  }));
  return [...train, ...roads];
}

/** Status i klartext med färgklasser: inställt (röd), försenat (orange), i tid (grön). */
export function trainStatus(t: Train) {
  if (t.canceled) return { text: 'Inställt', cls: 'bg-danger-strong text-white' };
  if (t.delay >= 3) return { text: `+${t.delay} min`, cls: 'bg-[#FF8A3D] text-[#1A1205]' };
  return { text: 'I tid', cls: 'bg-ok-soft text-ok' };
}
