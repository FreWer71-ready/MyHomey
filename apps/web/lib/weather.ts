// Väderprognos från SMHI (snow1g) med MET Norway som reserv. Symboler i MET:s format. Ren logik.
import type { IconName } from '@/components/Icon';

export type WeatherHour = { time: number; symbol: string; precip: number; temp: number };
export type WeatherSummary = {
  current: WeatherHour;
  /** Första timmen med nederbörd inom 6 h. */
  nextPrecip: WeatherHour | null;
  /** Nederbörd väntas inom 3 h (för fönstervarning). */
  rainSoon: boolean;
  /** Kommande dygn (från i morgon) för prognosvyn. Tom om källan inte ger det. */
  days?: WeatherDay[];
  /** Kommande timmar (upp till 24) för prognosvyn. */
  hours: WeatherHour[];
  /** Källa som gav prognosen. */
  source?: 'SMHI' | 'Yr';
};

type MetJson = {
  properties?: {
    timeseries?: {
      time: string;
      data: {
        instant: { details: { air_temperature?: number } };
        next_1_hours?: { summary: { symbol_code: string }; details: { precipitation_amount?: number } };
      };
    }[];
  };
};

export function parseMet(json: MetJson): WeatherHour[] {
  return (json.properties?.timeseries ?? [])
    .filter((t) => t.data.next_1_hours)
    .map((t) => ({
      time: Date.parse(t.time),
      symbol: t.data.next_1_hours!.summary.symbol_code,
      precip: t.data.next_1_hours!.details.precipitation_amount ?? 0,
      temp: t.data.instant.details.air_temperature ?? NaN,
    }));
}

const WET = 0.1; // mm/h

export function summarizeWeather(hours: WeatherHour[], now: number): WeatherSummary | null {
  const upcoming = hours.filter((h) => h.time + 3600_000 > now).sort((a, b) => a.time - b.time);
  if (!upcoming.length) return null;
  const within = (hrs: number) => upcoming.filter((h) => h.time < now + hrs * 3600_000);
  return {
    current: upcoming[0],
    nextPrecip: within(6).find((h) => h.precip >= WET) ?? null,
    rainSoon: within(3).some((h) => h.precip >= WET),
    hours: upcoming.slice(0, 24),
  };
}

/** MET-symbol → ikon och svensk text. */
export function symbolInfo(code: string): { icon: IconName; label: string; wet: boolean } {
  const night = code.endsWith('_night');
  const base = code.replace(/_(day|night|polartwilight)$/, '');
  if (base.includes('thunder')) return { icon: 'thunder', label: 'Åska', wet: true };
  if (base.includes('sleet')) return { icon: 'snow', label: 'Snöblandat regn', wet: true };
  if (base.includes('snow')) return { icon: 'snow', label: base.includes('showers') ? 'Snöbyar' : 'Snö', wet: true };
  if (base.includes('rain')) {
    return { icon: 'rain', label: base.includes('showers') ? 'Regnskurar' : base.startsWith('light') ? 'Lätt regn' : base.startsWith('heavy') ? 'Kraftigt regn' : 'Regn', wet: true };
  }
  if (base === 'fog') return { icon: 'fog', label: 'Dimma', wet: false };
  if (base === 'cloudy') return { icon: 'cloud', label: 'Mulet', wet: false };
  if (base === 'partlycloudy' || base === 'fair') return { icon: 'cloudSun', label: base === 'fair' ? 'Mest klart' : 'Halvklart', wet: false };
  return { icon: night ? 'moon' : 'sun', label: 'Klart', wet: false };
}

export type WeatherKind = 'sun' | 'moon' | 'partly-day' | 'partly-night' | 'cloud' | 'rain' | 'snow' | 'sleet' | 'fog' | 'thunder';

/** MET-symbol → typ av färgad vädersymbol. */
export function weatherKind(code: string): WeatherKind {
  const night = code.endsWith('_night');
  const base = code.replace(/_(day|night|polartwilight)$/, '');
  if (base.includes('thunder')) return 'thunder';
  if (base.includes('sleet')) return 'sleet';
  if (base.includes('snow')) return 'snow';
  if (base.includes('rain')) return 'rain';
  if (base === 'fog') return 'fog';
  if (base === 'cloudy') return 'cloud';
  if (base === 'partlycloudy' || base === 'fair') return night ? 'partly-night' : 'partly-day';
  return night ? 'moon' : 'sun';
}

// SMHI Wsymb2 (1–27) → MET-symbol. isDay avgör dag/natt (solhöjd, se sky.ts).
const WSYMB: Record<number, [string, boolean]> = {
  1: ['clearsky', true], 2: ['fair', true], 3: ['partlycloudy', true], 4: ['partlycloudy', true], 5: ['cloudy', false], 6: ['cloudy', false],
  7: ['fog', false], 8: ['lightrainshowers', true], 9: ['rainshowers', true], 10: ['heavyrainshowers', true], 11: ['rainshowersandthunder', true],
  12: ['lightsleetshowers', true], 13: ['sleetshowers', true], 14: ['heavysleetshowers', true], 15: ['lightsnowshowers', true],
  16: ['snowshowers', true], 17: ['heavysnowshowers', true], 18: ['lightrain', false], 19: ['rain', false], 20: ['heavyrain', false],
  21: ['rainandthunder', false], 22: ['lightsleet', false], 23: ['sleet', false], 24: ['heavysleet', false], 25: ['lightsnow', false],
  26: ['snow', false], 27: ['heavysnow', false],
};

export function smhiSymbol(code: number, day: boolean): string {
  const [name, daynight] = WSYMB[Math.round(code)] ?? ['cloudy', false];
  return daynight ? `${name}_${day ? 'day' : 'night'}` : name;
}

type SmhiJson = {
  timeSeries?: { time: string; intervalParametersStartTime?: string; data: Record<string, number | undefined> }[];
};

/** SMHI snow1g: nederbörd gäller timmen fram till "time", så timmen räknas från intervallets start. */
export function parseSmhi(json: SmhiJson, isDay: (ms: number) => boolean): WeatherHour[] {
  return (json.timeSeries ?? [])
    .filter((t) => t.data.symbol_code != null)
    .map((t) => {
      const end = Date.parse(t.time);
      const start = t.intervalParametersStartTime ? Date.parse(t.intervalParametersStartTime) : end - 3600_000;
      // Bara timvärden (längre fram blir intervallen längre).
      return end - start > 3600_000 ? null : {
        time: start,
        symbol: smhiSymbol(t.data.symbol_code!, isDay(start + 1800_000)),
        precip: t.data.precipitation_amount_mean_deterministic ?? t.data.precipitation_amount_mean ?? 0,
        temp: t.data.air_temperature ?? NaN,
      };
    })
    .filter((h): h is WeatherHour => h !== null);
}

export type WeatherDay = { date: string; min: number; max: number; precip: number; symbol: string };

const dayKeySthlm = (ms: number) =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
const hourSthlm = (ms: number) => Number(new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', hourCycle: 'h23' }).format(ms));

/**
 * SMHI: dygnsprognos ur hela tidsserien (timmar nära, sedan 3/6/12-timmarsintervall).
 * Min/max ur temperaturerna, nederbörd summerad per intervall, symbolen närmast kl 13.
 */
export function smhiDays(json: SmhiJson, now: number, count = 5): WeatherDay[] {
  const today = dayKeySthlm(now);
  const byDay = new Map<string, { temps: number[]; precip: number; best: { d: number; code: number } | null }>();
  for (const t of json.timeSeries ?? []) {
    const ms = Date.parse(t.time);
    const key = dayKeySthlm(ms);
    if (key <= today) continue;
    const g = byDay.get(key) ?? { temps: [], precip: 0, best: null };
    if (t.data.air_temperature != null) g.temps.push(t.data.air_temperature);
    g.precip += t.data.precipitation_amount_mean_deterministic ?? t.data.precipitation_amount_mean ?? 0;
    if (t.data.symbol_code != null) {
      const d = Math.abs(hourSthlm(ms) - 13);
      if (!g.best || d < g.best.d) g.best = { d, code: t.data.symbol_code };
    }
    byDay.set(key, g);
  }
  return [...byDay.entries()]
    .filter(([, g]) => g.temps.length && g.best)
    .slice(0, count)
    .map(([date, g]) => ({
      date, min: Math.min(...g.temps), max: Math.max(...g.temps),
      precip: Math.round(g.precip * 10) / 10, symbol: smhiSymbol(g.best!.code, true),
    }));
}
