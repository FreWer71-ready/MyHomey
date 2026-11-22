import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { geocode, loadArea, loadCommute, loadLocate, PLACE } from '@/lib/data';
import { guessPlace } from '@/lib/place-guess';
import { defaultGoal } from '@/lib/goal';
import { freshestPosition } from '@/lib/onboard';
import { etaConfigured, reverseGeocode, routeEta } from '@/lib/route';
import { groupRoad } from '@/lib/commute';
import { parseLatLon, pickPosition } from '@/lib/startpoint';
import { loadTransit, transitConfigured, transitGoal } from '@/lib/transit-source';
import { boxFor, km, onRoute, type LatLon } from '@/lib/trip';

// Resa från aktuell plats till jobbet eller hem, kollektivt (ResRobot) eller med bil (TomTom).
// ?from=here|home|work|place&to=home|work|place&mode=transit|car (&lat&lon&acc för Min plats, &fq/&q = adress eller\n// platsnamn för valfri plats som start/mål). Position: mobilen först, sedan Life360 (eller Apple Watch).
export const dynamic = 'force-dynamic';

const err = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function GET(req: Request) {
  const demo = process.env.NODE_ENV === 'development' && !!process.env.DEMO_DATA;
  if (!demo) {
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return err('Logga in', 401);
  }
  const q = new URL(req.url).searchParams;
  const from = q.get('from') ?? 'here', to = q.get('to'), mode = q.get('mode');
  const ENDS = ['home', 'work', 'place'];
  if (!['here', ...ENDS].includes(from) || !ENDS.includes(to ?? '') || (mode !== 'transit' && mode !== 'car')) return err('Ogiltig förfrågan', 400);
  // Tid: nu, avgång vid (dep) eller framme senast (arr), t = ms. Högst två veckor fram.
  const when = q.get('when') === 'dep' || q.get('when') === 'arr' ? q.get('when') as 'dep' | 'arr' : 'now';
  const t = Number(q.get('t'));
  const nowMs = Date.now();
  if (when !== 'now' && (!Number.isFinite(t) || t < nowMs - 3600_000 || t > nowMs + 14 * 86400_000)) return err('Ogiltig tid', 400);
  const at = when === 'now' ? nowMs : t;
  if (mode === 'transit' ? !transitConfigured() : !etaConfigured()) return err(mode === 'transit' ? 'Kollektivtrafik är inte inställd' : 'Bilresa är inte inställd', 404);

  // Valfri plats: adress (geokodning) eller platsnamn (TomTom-sökning nära hemmet).
  const findPlace = async (raw: string | null) => {
    const query = (raw ?? '').trim().slice(0, 120);
    if (query.length < 2) return { error: 'Skriv en adress eller plats' };
    const hit = await geocode(query).then((at) => (at ? { name: query, at } : guessPlace(query, PLACE))).catch(() => null);
    return hit ?? { error: `Hittade inte "${query}". Prova en adress med ort.` };
  };
  const goalAt = mode === 'transit' ? transitGoal()?.at : (await defaultGoal())?.at ?? transitGoal()?.at;
  // Hem, jobbet eller valfri plats som ändpunkt.
  const point = async (kind: string, raw: string | null): Promise<{ at: LatLon; name?: string } | { error: string }> => {
    if (kind === 'home') return { at: PLACE };
    if (kind === 'work') return goalAt ? { at: goalAt } : { error: 'Jobbet är inte inställt' };
    return findPlace(raw);
  };

  const target = await point(to!, q.get('q'));
  if ('error' in target) return err(target.error, target.error.startsWith('Hittade') ? 404 : 400);
  let pos: { at: LatLon; src: 'phone' | 'life360' | 'home' | 'work' | 'place'; name?: string } | null = null;
  if (from === 'here') {
    // Min plats: mobilen först, sedan Life360 (eller Apple Watch).
    const phone = parseLatLon(q.get('lat'), q.get('lon'), q.get('acc'));
    pos = pickPosition([{ at: phone, src: 'phone' }]);
    if (!pos) {
      const l = await loadLocate().catch(() => null);
      const p = l ? freshestPosition(l.members, l.items, process.env.HOUSEHOLD ?? '') : null;
      pos = pickPosition([{ at: p?.at, src: 'life360' }]);
    }
    if (!pos) return err('Ingen position. Tillåt platsåtkomst i webbläsaren eller starta Life360.', 404);
  } else {
    const o = await point(from, q.get('fq'));
    if ('error' in o) return err(o.error, o.error.startsWith('Hittade') ? 404 : 400);
    pos = { at: o.at, src: from as 'home' | 'work' | 'place', name: o.name };
  }
  const dest = target.at;
  const base = { from, to, mode, when, at, start: pos.src, ...(pos.name ? { fromName: pos.name } : {}), ...(target.name ? { place: target.name } : {}) };
  // Redan framme (inom 300 m)?
  if (km(pos.at, dest) <= 0.3) return NextResponse.json({ ...base, here: true });

  const noStore = { headers: { 'Cache-Control': 'private, no-store' } };
  // Adresser för start och mål (visas i svaret).
  const [fromAddr, toAddr] = await Promise.all([reverseGeocode(pos.at), reverseGeocode(dest)]);
  const info = { ...base, fromAddr, toAddr };
  if (mode === 'car') {
    const [eta, area] = await Promise.all([
      routeEta(pos.at, dest, when === 'arr' ? at : null, nowMs, when === 'dep' ? at : null), loadArea(boxFor([pos.at, dest], 8)).catch(() => []),
    ]);
    if (!eta) return err('Bilresan kunde inte räknas fram', 502);
    // Hinder längs vägen (Trafikverket): olyckor, vägarbeten, avstängningar – högst tre.
    const hinder = groupRoad(onRoute(area, eta.path ?? [])).slice(0, 3)
      .map((g) => ({ type: g.type, road: g.road, place: g.places[0] ?? null, tone: g.tone, count: g.count }));
    return NextResponse.json({ ...info, eta: { minutes: eta.minutes, trafficMin: eta.trafficMin, km: eta.km, arrive: eta.arrive, depart: eta.depart, live: eta.live }, hinder }, noStore);
  }
  // Hemifrån (inom 150 m) räknas från hemmets hållplats med promenad, som på pendlingssidan.
  const atHome = from === 'home' || km(pos.at, PLACE) <= 0.15;
  const trips = to === 'home' ? await loadTransit(pos.at, PLACE, at, 2, false, true, when === 'arr') : await loadTransit(pos.at, dest, at, 2, atHome, false, when === 'arr');
  if (!trips.length) return err('Ingen kollektivresa hittades', 502);
  const c = await loadCommute().catch(() => null);
  const idents = new Set(trips.flatMap((t) => t.legs.map((l) => l.num).filter(Boolean)));
  const trains = c ? [...c.out, ...c.home, ...c.all].filter((t) => idents.has(t.ident)) : [];
  return NextResponse.json({ ...info, trips, trains }, noStore);
}
