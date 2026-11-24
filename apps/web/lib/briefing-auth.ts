import { createHash, timingSafeEqual } from 'node:crypto';

/** Jämför nycklar i konstant tid (båda hashas till samma längd). Saknas given eller förväntad nyckel är svaret alltid nej. */
export function keyOk(given: string | null | undefined, expected: string | undefined): boolean {
  if (!given || !expected) return false;
  const h = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(h(given), h(expected));
}

/** Nyckeln ur "Authorization: Bearer …". */
export const bearer = (header: string | null) => (header?.startsWith('Bearer ') ? header.slice(7).trim() : null);
