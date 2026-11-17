// Ett tågs väg idag: alla passager (stationer och driftplatser mellan dem) från Trafikverket.
// Ren tolkning; testas i trainpath.test.ts.

export type RawAnn = {
  LocationSignature: string; ActivityType: 'Ankomst' | 'Avgang' | string; Advertised?: boolean; Canceled?: boolean;
  AdvertisedTimeAtLocation: string; EstimatedTimeAtLocation?: string; TimeAtLocation?: string; TrackAtLocation?: string;
  /** Tågets avgångsdag; samma tågnummer går varje dag. */
  ScheduledDepartureDateTime?: string;
};
export type Stop = {
  sig: string; name: string; station: boolean; planned: number; actual: number | null; est: number | null;
  /** Avvikelse i minuter (verklig eller förväntad mot plan). */
  delay: number | null; passed: boolean; canceled: boolean; track: string | null;
};
export type TrainPath = { stops: Stop[]; last: Stop | null; next: Stop | null };

const t = (s?: string) => (s ? Date.parse(s) : NaN);
const ok = (n: number) => (Number.isFinite(n) ? n : null);

/** En rad per plats i körordning. Avgång (eller passage) går före ankomst; stationer = annonserade. */
export function buildPath(all: RawAnn[], names: Record<string, string>, now = Date.now()): TrainPath {
  // Bara den körning (avgångsdag) som ligger närmast nu.
  const near = [...all].sort((x, y) => Math.abs(t(x.AdvertisedTimeAtLocation) - now) - Math.abs(t(y.AdvertisedTimeAtLocation) - now))[0];
  const raw = near?.ScheduledDepartureDateTime ? all.filter((a) => a.ScheduledDepartureDateTime === near.ScheduledDepartureDateTime) : all;
  const by = new Map<string, RawAnn[]>();
  for (const a of raw) by.set(a.LocationSignature, [...(by.get(a.LocationSignature) ?? []), a]);
  const stops = [...by.entries()].map(([sig, as]): Stop => {
    const dep = as.find((a) => a.ActivityType === 'Avgang');
    const arr = as.find((a) => a.ActivityType === 'Ankomst');
    const main = dep ?? arr!;
    // Passerad när tåget har gått därifrån (eller kommit fram till slutstationen).
    const actual = ok(t(dep?.TimeAtLocation)) ?? (dep ? null : ok(t(arr?.TimeAtLocation)));
    const planned = t(main.AdvertisedTimeAtLocation);
    const est = ok(t(main.EstimatedTimeAtLocation));
    const ref = actual ?? est;
    return {
      sig, name: names[sig] ?? sig, station: as.some((a) => a.Advertised !== false), planned, actual, est,
      delay: ref != null ? Math.round((ref - planned) / 60_000) : null,
      passed: actual != null || (!!arr && !dep && ok(t(arr.TimeAtLocation)) != null),
      canceled: as.every((a) => a.Canceled), track: main.TrackAtLocation ?? null,
    };
  }).sort((a, b) => a.planned - b.planned);
  const lastIdx = stops.map((s) => s.passed).lastIndexOf(true);
  return { stops, last: lastIdx >= 0 ? stops[lastIdx] : null, next: stops.slice(lastIdx + 1).find((s) => !s.canceled) ?? null };
}

const hm = (ms: number) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit' }).format(ms);
export const delayText = (d: number | null) => (d == null || Math.abs(d) < 1 ? 'i tid' : d > 0 ? `+${d} min` : `${d} min`);

/** Kort rad om var tåget är: "Passerade Valskog 14:47 · +8 min" eller "Avgår från Arboga 14:34". */
export function whereNow(p: TrainPath): string | null {
  if (!p.stops.length) return null;
  if (!p.last) { const f = p.stops[0]; return `Ej avgått från ${f.name} (${hm(f.est ?? f.planned)})`; }
  if (!p.next) return `Framme i ${p.last.name} ${hm(p.last.actual!)}`;
  return `Passerade ${p.last.name} ${hm(p.last.actual!)} · ${delayText(p.last.delay)}`;
}
