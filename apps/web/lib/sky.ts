// Bakgrund: väderlek från MET-symbol × tid på dygnet från solens höjd. Ren logik.

export type Condition = 'clear' | 'cloudy' | 'rain' | 'snow' | 'fog' | 'storm';
export type Phase = 'day' | 'dusk' | 'night';

export function conditionOf(symbol: string | null | undefined): Condition {
  const s = (symbol ?? '').replace(/_(day|night|polartwilight)$/, '');
  if (s.includes('thunder')) return 'storm';
  if (s.includes('snow')) return 'snow';
  if (s.includes('rain') || s.includes('sleet')) return 'rain';
  if (s === 'fog') return 'fog';
  if (s === 'cloudy' || s === 'partlycloudy') return 'cloudy';
  return 'clear';
}

/** Solens höjd över horisonten i grader (NOAA-förenkling, ±0,5°). */
export function solarElevation(ms: number, lat: number, lon: number): number {
  const rad = Math.PI / 180;
  const d = ms / 86400_000 - 10957.5; // dagar sedan J2000
  const g = (357.529 + 0.98560028 * d) * rad;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const e = (23.439 - 0.00000036 * d) * rad;
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) / rad;
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
  const ha = ((gmst * 15 + lon - ra) % 360) * rad;
  return Math.asin(Math.sin(lat * rad) * Math.sin(dec) + Math.cos(lat * rad) * Math.cos(dec) * Math.cos(ha)) / rad;
}

/** Dag över +6°, skymning/gryning ±6°, natt under −6°. */
export function phaseOf(ms: number, lat: number, lon: number): Phase {
  const el = solarElevation(ms, lat, lon);
  return el > 6 ? 'day' : el > -6 ? 'dusk' : 'night';
}

/** Vikter för dag-, skymnings- och nattbild efter solhöjd, så att bilderna tonar mjukt (summa 1). */
export function phaseWeights(el: number): Record<Phase, number> {
  const ramp = (x: number, a: number, b: number) => Math.min(1, Math.max(0, (x - a) / (b - a)));
  const day = ramp(el, 2, 10); // dusk → day mellan +2° och +10°
  const night = 1 - ramp(el, -10, -2); // night → dusk mellan −10° och −2°
  return { day, night, dusk: Math.max(0, 1 - day - night) };
}

/** Färgton över bilden efter tid på dygnet: gyllene timme, blå timme, svag natt. */
export function skyTint(el: number): string {
  if (el > 12) return 'rgb(255 244 220 / 0.04)';
  if (el > 0) return `rgb(255 150 80 / ${(0.04 + ((12 - el) / 12) * 0.14).toFixed(3)})`;
  if (el > -8) return `rgb(70 100 210 / ${(0.1 + (-el / 8) * 0.08).toFixed(3)})`;
  return 'rgb(20 30 80 / 0.16)';
}

/** Vad bakgrundens rörliga lager ska visa. Värden 0–1 utom vind (m/s) och nederbörd (mm/h). */
export type SkyState = {
  condition: Condition;
  precip: number;
  wind: number;
  windFrom: number;
  clouds: number;
  thunder: number;
};

export function skyState(h: { symbol: string; precip: number; wind?: number; windFrom?: number; clouds?: number; thunder?: number } | null | undefined): SkyState {
  const condition = conditionOf(h?.symbol);
  const fallbackClouds = { clear: 0.15, cloudy: 0.7, rain: 0.9, snow: 0.85, fog: 0.6, storm: 1 }[condition];
  return {
    condition,
    precip: h?.precip ?? 0,
    wind: h?.wind ?? 3,
    windFrom: h?.windFrom ?? 240,
    clouds: h?.clouds ?? fallbackClouds,
    thunder: condition === 'storm' ? Math.max(0.5, h?.thunder ?? 0) : (h?.thunder ?? 0),
  };
}
