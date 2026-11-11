// Bakgrund: väderlek från MET-symbol × tid på dygnet från solens höjd. Ren logik.

export type Condition = 'clear' | 'cloudy' | 'rain' | 'snow' | 'fog';
export type Phase = 'day' | 'dusk' | 'night';

export function conditionOf(symbol: string | null | undefined): Condition {
  const s = (symbol ?? '').replace(/_(day|night|polartwilight)$/, '');
  if (s.includes('snow')) return 'snow';
  if (s.includes('rain') || s.includes('sleet') || s.includes('thunder')) return 'rain';
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

/** Bildnamn utan ändelse; Backdrop väljer liggande (platta) eller stående (-p, mobil). */
export const backgroundSrc = (symbol: string | null | undefined, ms: number, lat: number, lon: number) =>
  `/mydashboard/bg/${conditionOf(symbol)}-${phaseOf(ms, lat, lon)}`;
