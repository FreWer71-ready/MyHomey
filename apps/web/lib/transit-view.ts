// Klientsäkra visningshjälpare för kollektivresor (inga serverberoenden: lib/transit.ts drar in kalendern och node-ical).
import type { TransitLeg } from './transit.ts';

/** Gångsträcka som text: "280 m", "1,2 km". */
export const fmtMeters = (m: number) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`);

/**
 * Linjebricka som i SL-appen: nummer på linjens färg (tunnelbana röd/grön/blå, Tvärbanan, pendeltåg rosa, buss blå).
 * Null när linjen saknar nummer eller färg (då visas hela namnet, t.ex. "Regionaltåg 914").
 */
export function lineBadge(l: Pick<TransitLeg, 'kind' | 'label' | 'num'>): { text: string; color: string } | null {
  const text = l.label?.match(/(\d+)\s*$/)?.[1] ?? (l.num && /^\d+$/.test(l.num) ? l.num : null);
  if (!text || l.kind === 'walk') return null;
  const n = Number(text);
  if (l.kind === 'metro') return { text, color: n >= 17 ? '#1F7A33' : n >= 13 ? '#C8282A' : '#0B6BAE' };
  if (l.kind === 'tram') return { text, color: n === 30 || n === 31 || n === 21 ? '#9A5B16' : n >= 25 && n <= 26 ? '#0E7F96' : n >= 27 && n <= 29 ? '#7B4A95' : '#5F7388' };
  if (l.kind === 'train') return /^pendeltåg/i.test(l.label ?? '') ? { text, color: '#C93D7B' } : null;
  if (l.kind === 'bus') return { text, color: '#2563A8' };
  return null;
}
