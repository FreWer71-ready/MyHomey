import 'server-only';
import { thinPath, type LatLon } from './trip';

// Restid med bil via TomTom Routing (trafik i realtid nära i tiden, annars historisk trafik för tiden på dygnet).
// TOMTOM_API_KEY i Vercel; utan nyckel visas ingen restid. Nyckeln får aldrig hamna i loggar eller svar.

export type Eta = {
  /** Rekommenderad avresa (ms) för att vara framme i tid, eller beräknad ankomst om man åker nu. */
  depart: number; arrive: number;
  minutes: number; trafficMin: number; km: number;
  /** true: händelsen börjar snart, beräknat från "åk nu"; false: bakåt från starttiden. */
  live: boolean;
  /** Rutten som punkter (glesad), för att hitta hinder som faktiskt ligger på vägen. */
  path?: LatLon[];
};

export const etaConfigured = () => !!process.env.TOMTOM_API_KEY;

/** Avrundad position (cirka 1 km), så att cachen träffar trots små rörelser. */
const pt = (p: LatLon) => `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`;

/**
 * Restid från `from` till `to`. Med `arriveBy` (ms) och mer än 45 min dit räknas bakåt från ankomsten
 * (TomTom arriveAt); annars "åk nu" med aktuell trafik. Null utan nyckel eller om tjänsten inte svarar.
 */
export async function routeEta(from: LatLon, to: LatLon, arriveBy: number | null, now = Date.now(), departAt: number | null = null): Promise<Eta | null> {
  const key = process.env.TOMTOM_API_KEY;
  if (!key) return null;
  // Vald avgångstid (Sök resa): trafik för den tiden, inte "åk nu".
  const later = departAt != null && departAt - now > 10 * 60_000;
  const live = !later && (arriveBy == null || arriveBy - now < 45 * 60_000);
  const q = new URLSearchParams({ key, traffic: 'true', travelMode: 'car', routeType: 'fastest', computeTravelTimeFor: 'all' });
  // Ankomst avrundad till 5 min (stabil cache-nyckel).
  if (later) q.set('departAt', new Date(Math.floor(departAt! / 300_000) * 300_000).toISOString().replace(/\.\d{3}Z$/, 'Z'));
  else if (!live) q.set('arriveAt', new Date(Math.floor(arriveBy! / 300_000) * 300_000).toISOString().replace(/\.\d{3}Z$/, 'Z'));
  try {
    const res = await fetch(`https://api.tomtom.com/routing/1/calculateRoute/${pt(from)}:${pt(to)}/json?${q}`, {
      next: { revalidate: live ? 300 : 900 }, signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) { console.error(`TomTom: status ${res.status}`); return null; }
    const route = (await res.json())?.routes?.[0];
    const s = route?.summary;
    if (!s?.travelTimeInSeconds) return null;
    const pts: LatLon[] = (route.legs ?? []).flatMap((l: { points?: { latitude: number; longitude: number }[] }) => (l.points ?? []).map((p) => ({ lat: p.latitude, lon: p.longitude })));
    return {
      depart: Date.parse(s.departureTime), arrive: Date.parse(s.arrivalTime),
      minutes: Math.round(s.travelTimeInSeconds / 60), trafficMin: Math.round((s.trafficDelayInSeconds ?? 0) / 60),
      km: s.lengthInMeters / 1000, live, path: thinPath(pts),
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
