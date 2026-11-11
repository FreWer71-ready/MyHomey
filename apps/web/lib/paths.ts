/** Måste matcha basePath i next.config.ts. */
export const BASE_PATH = '/mydashboard';

/** Relativ redirect, så att den fungerar både via trand.se och appens egen domän. */
export const relativeRedirect = (path: string) =>
  new Response(null, { status: 303, headers: { Location: `${BASE_PATH}${path}` } });
