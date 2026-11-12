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

/**
 * Nycklar för allt som syns under Larm. Menyn jämför dem med det användaren redan sett
 * och markerar klockan när något nytt dykt upp. Öppna dörrar räknas inte (öppnas hela tiden).
 */
export function alarmKeys(
  h: { lowBatteryList: { id: string }[]; silent: { id: string }[]; openings: Opening[]; rooms: Room[] },
  weather: WeatherSummary | null,
): string[] {
  return [
    ...h.lowBatteryList.map((b) => `b:${b.id}`),
    ...h.silent.map((s) => `s:${s.id}`),
    ...h.openings.filter((o) => o.open && o.kind === 'window').map((o) => `w:${o.id}`),
    ...humidityWarnings(h.rooms).map((r) => `h:${r.id}`),
    ...(rainWarning(weather, h.openings) ? ['rain'] : []),
  ];
}
