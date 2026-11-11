// Varningar som kombinerar flera källor. Ren logik.
import type { Opening, Room } from './home';
import type { WeatherSummary } from './weather';

/** Nederbörd inom 3 h och minst ett fönster öppet. */
export function rainWarning(weather: WeatherSummary | null, openings: Opening[]) {
  const windows = openings.filter((o) => o.kind === 'window' && o.open);
  if (!weather?.rainSoon || !windows.length) return null;
  return { at: weather.nextPrecip?.time ?? weather.current.time, windows };
}

/** Fuktgräns för våtrum (mögelrisk, dags att vädra/köra fläkten). */
export const HUMIDITY_LIMIT = 70;

export function humidityWarnings(rooms: Room[]) {
  return rooms.filter((r) => r.humidity != null && r.humidity >= HUMIDITY_LIMIT);
}
