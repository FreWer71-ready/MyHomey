// Väderprognos från MET Norway (locationforecast compact). Ren logik.
import type { IconName } from '@/components/Icon';

export type WeatherHour = { time: number; symbol: string; precip: number; temp: number };
export type WeatherSummary = {
  current: WeatherHour;
  /** Första timmen med nederbörd inom 6 h. */
  nextPrecip: WeatherHour | null;
  /** Nederbörd väntas inom 3 h (för fönstervarning). */
  rainSoon: boolean;
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
