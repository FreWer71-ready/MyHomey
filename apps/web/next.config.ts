import type { NextConfig } from 'next';

// Appen serveras på trand.se/mydashboard (trand.se skriver om dit).
export const BASE_PATH = '/mydashboard';

// Versionsnotering: byggdatum (Stockholm) och commit från Vercel.
const built = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', dateStyle: 'short', timeStyle: 'short' }).format(new Date());

const config: NextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_BUILT: built,
    NEXT_PUBLIC_COMMIT: (process.env.VERCEL_GIT_COMMIT_SHA ?? 'lokal').slice(0, 7),
  },
  basePath: BASE_PATH,
  experimental: {
    // Server actions anropas via trand.se, inte appens egen domän.
    serverActions: { allowedOrigins: ['trand.se', 'www.trand.se'] },
  },
};
export default config;
