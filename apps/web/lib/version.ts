/**
 * Appens version, V0.9.PR<nummer> (se next.config.ts: grundversion och PR-nummer sätts vid bygget).
 * Visas diskret ovanför huset i sidomenyn (stor skärm).
 */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? 'V0.9';
