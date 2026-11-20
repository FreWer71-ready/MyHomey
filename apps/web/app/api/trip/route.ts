import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { loadCommute, loadLocate, PLACE } from '@/lib/data';
import { defaultGoal } from '@/lib/goal';
import { freshestPosition } from '@/lib/onboard';
import { etaConfigured, routeEta } from '@/lib/route';
import { parseLatLon, pickPosition } from '@/lib/startpoint';
import { loadTransit, transitConfigured, transitGoal } from '@/lib/transit-source';
import { km } from '@/lib/trip';

// Resa från aktuell plats till jobbet eller hem, kollektivt (ResRobot) eller med bil (TomTom).
// ?to=home|work&mode=transit|car&lat&lon&acc. Position: mobilen först, sedan Life360 (eller Apple Watch).
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
  const to = q.get('to'), mode = q.get('mode');
  if ((to !== 'home' && to !== 'work') || (mode !== 'transit' && mode !== 'car')) return err('Ogiltig förfrågan', 400);

  const phone = parseLatLon(q.get('lat'), q.get('lon'), q.get('acc'));
  let pos = pickPosition([{ at: phone, src: 'phone' }]);
  if (!pos) {
    const l = await loadLocate().catch(() => null);
    const p = l ? freshestPosition(l.members, l.items, process.env.HOUSEHOLD ?? '') : null;
    pos = pickPosition([{ at: p?.at, src: 'life360' }]);
  }
  if (!pos) return err('Ingen position. Tillåt platsåtkomst i webbläsaren eller starta Life360.', 404);

  const goalAt = mode === 'transit' ? transitGoal()?.at : (await defaultGoal())?.at ?? transitGoal()?.at;
  const dest = to === 'home' ? PLACE : goalAt;
  if (mode === 'transit' ? !transitConfigured() : !etaConfigured()) return err(mode === 'transit' ? 'Kollektivtrafik är inte inställd' : 'Bilresa är inte inställd', 404);
  if (!dest) return err('Jobbet är inte inställt', 404);
  const base = { to, mode, start: pos.src };
  // Redan framme (inom 300 m)?
  if (km(pos.at, dest) <= 0.3) return NextResponse.json({ ...base, here: true });

  const noStore = { headers: { 'Cache-Control': 'private, no-store' } };
  if (mode === 'car') {
    const eta = await routeEta(pos.at, dest, null);
    return eta ? NextResponse.json({ ...base, eta: { minutes: eta.minutes, trafficMin: eta.trafficMin, km: eta.km, arrive: eta.arrive } }, noStore) : err('Bilresan kunde inte räknas fram', 502);
  }
  // Hemifrån (inom 150 m) räknas från hemmets hållplats med promenad, som på pendlingssidan.
  const atHome = km(pos.at, PLACE) <= 0.15;
  const trips = to === 'home' ? await loadTransit(pos.at, PLACE, Date.now(), 2, false, true) : await loadTransit(pos.at, dest, Date.now(), 2, atHome);
  if (!trips.length) return err('Ingen kollektivresa hittades', 502);
  const c = await loadCommute().catch(() => null);
  const idents = new Set(trips.flatMap((t) => t.legs.map((l) => l.num).filter(Boolean)));
  const trains = c ? [...c.out, ...c.home, ...c.all].filter((t) => idents.has(t.ident)) : [];
  return NextResponse.json({ ...base, trips, trains }, noStore);
}
