import type { NextConfig } from 'next';

// Appen serveras på trand.se/<adress> (trand.se skriver om dit). Varje hushåll har en egen installation
// med NEXT_PUBLIC_BASE_PATH, t.ex. /mydashboard eller /ulrikasdashboard.
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '/mydashboard';

// Versionsnotering: byggdatum (Stockholm) och commit från Vercel.
const built = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', dateStyle: 'short', timeStyle: 'short' }).format(new Date());

// Version (semantisk, ett enda ställe): V<stor>.<mindre>.<fix>. Höjs av Claude i varje ändring, se CLAUDE.md "Version".
const version = "V1.7.1";
console.log(`Version ${version}`); // syns i bygglogg

const config: NextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_BASE_PATH: BASE_PATH,
    NEXT_PUBLIC_BUILT: built,
    NEXT_PUBLIC_APP_VERSION: version,
    // Pendling (Trafikverket) per installation: COMMUTE=off (av), road (bara väg) eller standard (tåg + väg).
    NEXT_PUBLIC_COMMUTE: process.env.COMMUTE === 'off' || process.env.COMMUTE === 'road' ? process.env.COMMUTE : 'on',
    NEXT_PUBLIC_COMMIT: (process.env.VERCEL_GIT_COMMIT_SHA ?? 'lokal').slice(0, 7),
  },
  basePath: BASE_PATH,
  experimental: {
    // Klientens sidcache: hopp mellan sidor visas direkt från minnet i 30 s (förut ingen cache för dynamiska sidor).
    // LiveRefresh och serveråtgärder hämtar om sidan när värden ändras, och det rensar cachen.
    staleTimes: { dynamic: 30, static: 180 },
    // Server actions anropas via trand.se, inte appens egen domän.
    serverActions: { allowedOrigins: ['trand.se', 'www.trand.se'] },
  },
};
export default config;
