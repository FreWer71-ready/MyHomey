import type { NextConfig } from 'next';

// Appen serveras på trand.se/mydashboard (trand.se skriver om dit).
export const BASE_PATH = '/mydashboard';

const config: NextConfig = {
  reactStrictMode: true,
  basePath: BASE_PATH,
  experimental: {
    // Server actions anropas via trand.se, inte appens egen domän.
    serverActions: { allowedOrigins: ['trand.se', 'www.trand.se'] },
  },
};
export default config;
