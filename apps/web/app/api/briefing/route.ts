import { NextResponse } from 'next/server';
import { bearer, keyOk } from '@/lib/briefing-auth';
import { briefingText } from '@/lib/briefing';
import { loadBriefing } from '@/lib/briefing-source';

// Rapporten som ren text, för genvägar och appar utan inloggning (iPhone: Genvägar + Siri, Android: Tasker, HTTP Shortcuts,
// Fully Kiosk, Homey). Nyckel i BRIEFING_TOKEN, skickas i "Authorization: Bearer …" (aldrig i adressen, som hamnar i loggar).
// Släpps förbi inloggningen i middleware.ts; nyckeln är skyddet. Bara läsning, och bara data som inte kräver inloggning
// (väder, tåg, kalender, resor); hushållets egna data (Hue, Life360) används inte här.
// ?format=json ger { text, parts } i stället för ren text.
export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'private, no-store' };

export async function GET(req: Request) {
  if (!process.env.BRIEFING_TOKEN) return NextResponse.json({ error: 'Rapporten är inte påslagen.' }, { status: 404 });
  if (!keyOk(bearer(req.headers.get('authorization')), process.env.BRIEFING_TOKEN)) return NextResponse.json({ error: 'Saknar behörighet.' }, { status: 401, headers: noStore });
  const now = Date.now();
  const b = await loadBriefing(now, { anonymous: true }).catch(() => null);
  if (!b) return NextResponse.json({ error: 'Rapporten kunde inte hämtas just nu.' }, { status: 502, headers: noStore });
  const text = briefingText({ name: b.name, now, weather: b.weather, parts: b.parts });
  return new URL(req.url).searchParams.get('format') === 'json'
    ? NextResponse.json({ text, parts: b.parts }, { headers: noStore })
    : new NextResponse(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8', ...noStore } });
}
