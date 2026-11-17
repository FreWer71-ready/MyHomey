import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildPath, type RawAnn } from '@/lib/trainpath';

// Ett tågs väg idag (stationer och driftplatser) via edge-funktionen trafik. Kräver inloggning.
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ ident: string }> }) {
  const { ident } = await params;
  if (!/^\d{1,6}$/.test(ident)) return NextResponse.json({ error: 'Ogiltigt tåg' }, { status: 400 });
  const demo = process.env.NODE_ENV === 'development' && !!process.env.DEMO_DATA;
  if (demo) {
    const at = (min: number) => new Date(Date.now() + min * 60_000).toISOString();
    const ann = (sig: string, act: string, plan: number, actual?: number, adv = true): RawAnn =>
      ({ LocationSignature: sig, ActivityType: act, Advertised: adv, AdvertisedTimeAtLocation: at(plan), ...(actual != null ? { TimeAtLocation: at(actual) } : {}) });
    return NextResponse.json(buildPath([
      ann('Arb', 'Avgang', -30, -26), ann('Vsg', 'Avgang', -25, -17, false), ann('Kör', 'Avgang', -19, -8),
      ann('Rk', 'Avgang', -12, undefined, false), ann('Et', 'Ankomst', -6), ann('Et', 'Avgang', -2), ann('Sgs', 'Avgang', 12), ann('Cst', 'Ankomst', 59),
    ], { Arb: 'Arboga', Vsg: 'Valskog', Kör: 'Kungsör', Rk: 'Rekarne', Et: 'Eskilstuna C', Sgs: 'Strängnäs', Cst: 'Stockholm C' }));
  }
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Logga in' }, { status: 401 });
  const { data, error } = await sb.functions.invoke('trafik', { body: { train: ident } });
  if (error || !data || data.error) return NextResponse.json({ error: 'Tåginfo saknas just nu' }, { status: 502 });
  return NextResponse.json(buildPath(data.announcements as RawAnn[], data.names as Record<string, string>), { headers: { 'Cache-Control': 'no-store' } });
}
