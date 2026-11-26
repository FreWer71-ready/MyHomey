import { NextResponse } from 'next/server';
import { stopName } from '@/lib/transit';

// Förslag medan man skriver i Sök resa: hållplatser, adresser och platser från ResRobot (location.name).
// Bara sökordet skickas vidare; svaret cachas ett dygn per sökord.
export const dynamic = 'force-dynamic';

type Loc = { StopLocation?: { extId?: string; name?: string; lat?: number; lon?: number }; CoordLocation?: { name?: string; lat?: number; lon?: number; type?: string } };

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q')?.trim().slice(0, 80) ?? '';
  const key = process.env.RESROBOT_API_KEY;
  if (q.length < 2 || !key) return NextResponse.json({ places: [] });
  const p = new URLSearchParams({ format: 'json', accessId: key, input: `${q}?`, maxNo: '6' });
  try {
    const res = await fetch(`https://api.resrobot.se/v2.1/location.name?${p}`, { next: { revalidate: 86400 }, signal: AbortSignal.timeout(5000) });
    const body = res.ok ? await res.json() as { stopLocationOrCoordLocation?: Loc[] } : null;
    const places = (body?.stopLocationOrCoordLocation ?? []).flatMap((x) => {
      const s = x.StopLocation, c = x.CoordLocation;
      const v = s ?? c;
      if (!v?.name || typeof v.lat !== 'number' || typeof v.lon !== 'number') return [];
      const kind = s ? 'stop' : c?.type === 'ADR' ? 'address' : 'place';
      return [{ name: s ? stopName(v.name) : v.name, lat: v.lat, lon: v.lon, kind }];
    });
    return NextResponse.json({ places }, { headers: { 'Cache-Control': 'private, max-age=300' } });
  } catch {
    return NextResponse.json({ places: [] });
  }
}
