import 'server-only';
import { editDistance, km, placeCandidates, type LatLon } from './trip';

// Gissar plats ur en kalendertitel utan platsfält (t.ex. "Tunahallen W fotboll") med TomTom Search.
// Bara säkra träffar: namnet skiljer sig med högst 2 tecken från ordet i titeln och platsen ligger inom 60 km.

export async function guessPlace(title: string, near: LatLon): Promise<{ name: string; at: LatLon } | null> {
  const key = process.env.TOMTOM_API_KEY;
  if (!key) return null;
  for (const cand of placeCandidates(title)) {
    try {
      const q = new URLSearchParams({ key, countrySet: 'SE', lat: String(near.lat), lon: String(near.lon), radius: '60000', limit: '3', language: 'sv-SE' });
      const res = await fetch(`https://api.tomtom.com/search/2/search/${encodeURIComponent(cand)}.json?${q}`, { next: { revalidate: 30 * 86400 }, signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const results = ((await res.json())?.results ?? []) as { type: string; poi?: { name?: string }; address?: { municipality?: string }; position: { lat: number; lon: number } }[];
      const hit = results.find((r) => (r.type === 'POI' || r.type === 'Geography') && editDistance((r.poi?.name ?? r.address?.municipality ?? ''), cand) <= 2);
      if (hit && km(near, { lat: hit.position.lat, lon: hit.position.lon }) <= 60) return { name: hit.poi?.name ?? cand, at: { lat: hit.position.lat, lon: hit.position.lon } };
    } catch { /* nästa kandidat */ }
  }
  return null;
}
