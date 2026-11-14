/** Måste matcha basePath i next.config.ts. */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '/mydashboard';

/** Appens namn när den installeras (skiljer de två dashboardsen åt på hemskärmen). */
export const APP_NAME = BASE_PATH.includes('ulrika') ? 'Ulrikas hem' : 'MyHomey';

/**
 * Publik adress till en sida i appen. I produktion nås appen via trand.se
 * (PUBLIC_ORIGIN), lokalt via sin egen adress.
 */
export const publicUrl = (path: string, fallbackOrigin: string) =>
  new URL(`${BASE_PATH}${path}`, process.env.PUBLIC_ORIGIN ?? fallbackOrigin);
