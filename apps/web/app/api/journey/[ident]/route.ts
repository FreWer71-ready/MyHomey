import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { loadCommute, loadLocate, PLACE } from '@/lib/data';
import { journeyFor, transitConfigured, transitGoal } from '@/lib/transit-source';
import { freshestPosition, TERMINALS } from '@/lib/onboard';
import { parseLatLon, pickStart } from '@/lib/startpoint';

// Resa dörr till dörr för ett tåg i pendlingen (hämtas när man öppnar den, så att ResRobot inte anropas för varje tåg).
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ ident: string }> }) {
  const { ident } = await params;
  if (!/^\d{1,6}$/.test(ident)) return NextResponse.json({ error: 'Ogiltigt tåg' }, { status: 400 });
  if (!transitConfigured()) return NextResponse.json({ error: 'Ingen resväg inställd' }, { status: 404 });
  const demo = process.env.NODE_ENV === 'development' && !!process.env.DEMO_DATA;
  if (!demo) {
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Logga in' }, { status: 401 });
  }
  const c = await loadCommute();
  const out = c?.out.find((t) => t.ident === ident);
  const home = c?.home.find((t) => t.ident === ident);
  const t = out ?? home;
  if (!t) return NextResponse.json({ error: 'Tåget finns inte i pendlingen' }, { status: 404 });
  // Startpunkt: mobilens plats (?lat&lon&acc) först, sedan Life360 (eller Apple Watch), annars hemmet/jobbet.
  const q = new URL(req.url).searchParams;
  const near = out ? TERMINALS[0] : transitGoal()!.at;
  let start = pickStart([{ at: parseLatLon(q.get('lat'), q.get('lon'), q.get('acc')), src: 'phone' }], PLACE, near, !!out);
  if (!start) {
    const l = await loadLocate().catch(() => null);
    const pos = l ? freshestPosition(l.members, l.items, process.env.HOUSEHOLD ?? '') : null;
    start = pickStart([{ at: pos?.at, src: 'life360' }], PLACE, near, !!out);
  }
  const j = await journeyFor({ ...t, arr: t.arr }, !!out, PLACE, start);
  return j ? NextResponse.json(j, { headers: { 'Cache-Control': 'private, no-store' } }) : NextResponse.json({ error: 'Resan kunde inte räknas fram' }, { status: 502 });
}
