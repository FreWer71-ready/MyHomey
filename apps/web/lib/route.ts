import 'server-only';
import type { LatLon } from './trip';

// Restid med bil via TomTom Routing (trafik i realtid nära i tiden, annars historisk trafik för tiden på dygnet).
// TOMTOM_API_KEY i Vercel; utan nyckel visas ingen restid. Nyckeln får aldrig hamna i loggar eller svar.

export type Eta = {
  /** Rekommenderad avresa (ms) för att vara framme i tid, eller beräknad ankomst om man åker nu. */
  depart: number; arrive: number;
  minutes: number; trafficMin: number; km: number;
  /** true: händelsen börjar snart, beräknat från "åk nu"; false: bakåt från starttiden. */
  live: boolean;
};

export const etaConfigured = () => !!process.env.TOMTOM_API_KEY;

/** Avrundad position (cirka 1 km), så att cachen träffar trots små rörelser. */
const pt = (p: LatLon) => `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`;

/**
 * Restid från `from` till `to`. Med `arriveBy` (ms) och mer än 45 min dit räknas bakåt från ankomsten
 * (TomTom arriveAt); annars "åk nu" med aktuell trafik. Null utan nyckel eller om tjänsten inte svarar.
 */
export async function routeEta(from: LatLon, to: LatLon, arriveBy: number | null, now = Date.now()): Promise<Eta | null> {
  const key = process.env.TOMTOM_API_KEY;
  if (!key) return null;
  const live = arriveBy == null || arriveBy - now < 45 * 60_000;
  const q = new URLSearchParams({ key, traffic: 'true', travelMode: 'car', routeType: 'fastest', computeTravelTimeFor: 'all' });
  // Ankomst avrundad till 5 min (stabil cache-nyckel).
  if (!live) q.set('arriveAt', new Date(Math.floor(arriveBy! / 300_000) * 300_000).toISOString().replace(/\.\d{3}Z$/, 'Z'));
  try {
    const res = await fetch(`https://api.tomtom.com/routing/1/calculateRoute/${pt(from)}:${pt(to)}/json?${q}`, {
      next: { revalidate: live ? 300 : 900 }, signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) { console.error(`TomTom: status ${res.status}`); return null; }
    const s = (await res.json())?.routes?.[0]?.summary;
    if (!s?.travelTimeInSeconds) return null;
    return {
      depart: Date.parse(s.departureTime), arrive: Date.parse(s.arrivalTime),
      minutes: Math.round(s.travelTimeInSeconds / 60), trafficMin: Math.round((s.trafficDelayInSeconds ?? 0) / 60),
      km: s.lengthInMeters / 1000, live,
    };
  } catch (e) {
    console.error(`TomTom: ${(e as Error)?.name ?? 'fel'}`);
    return null;
  }
}

/** Adress för en punkt (TomTom omvänd geokodning), t.ex. "Kungsgatan 3, Eskilstuna". Null utan nyckel eller vid fel. */
export async function reverseGeocode(at: LatLon): Promise<string | null> {
  const key = process.env.TOMTOM_API_KEY;
  if (!key) return null;
  try {
    const q = new URLSearchParams({ key, language: 'sv-SE' });
    const res = await fetch(`https://api.tomtom.com/search/2/reverseGeocode/${at.lat.toFixed(5)},${at.lon.toFixed(5)}.json?${q}`, {
      next: { revalidate: 86400 }, signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const a = (await res.json())?.addresses?.[0]?.address;
    const street = [a?.streetName, a?.streetNumber].filter(Boolean).join(' ');
    const town = a?.municipalitySubdivision || a?.municipality;
    return [street, town].filter(Boolean).join(', ') || a?.freeformAddress || null;
  } catch {
    return null;
  }
}
