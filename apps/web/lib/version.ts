/**
 * Appens version, V<stor>.<mindre>.<fix> (sätts i next.config.ts och höjs i varje ändring).
 * Visas diskret ovanför huset i sidomenyn (stor skärm) och längst ned på mobil.
 */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? 'V1.2.0';
