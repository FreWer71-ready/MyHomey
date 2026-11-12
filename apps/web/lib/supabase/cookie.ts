import { BASE_PATH } from '../paths';

/**
 * Varje dashboard under trand.se har en egen inloggningskaka, annars följer inloggningen med
 * mellan /mydashboard och /ulrikasdashboard. /mydashboard behåller standardnamnet (ingen ny inloggning).
 */
export const COOKIE_OPTIONS =
  BASE_PATH === '/mydashboard' ? undefined : { name: `sb-${BASE_PATH.replace(/\W/g, '')}-auth`, path: BASE_PATH };
