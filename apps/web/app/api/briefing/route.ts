import { NextResponse } from 'next/server';
import { bearer, keyOk } from '@/lib/briefing-auth';
import { briefingText } from '@/lib/briefing';
import { loadBriefing } from '@/lib/briefing-source';

// Rapporten som ren text, för genvägar och appar utan inloggning (iPhone: Genvägar + Siri, Android: Tasker, HTTP Shortcuts,
// Fully Kiosk, Homey). Nyckel i BRIEFING_TOKEN, skickas i "Authorization: Bearer …" (aldrig i adressen, som hamnar i loggar).
// Släpps förbi inloggningen i middleware.ts; nyckeln är skyddet. Bara läsning, och bara rapportens data: det som inte kräver inloggning
// (väder, tåg, kalender, resor) plus hemmets data via databasfunktionen briefing_rows (nyckeln hör till ett hushåll; bara läsning).
// ?format=json ger { text, parts } i stället för ren text.
export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'private, no-store' };

export async function GET(req: Request) {
  if (!process.env.BRIEFING_TOKEN) return NextResponse.json({ error: 'Rapporten är inte påslagen.' }, { status: 404 });
  const key = bearer(req.headers.get('authorization'));
  if (!key || !keyOk(key, process.env.BRIEFING_TOKEN)) return NextResponse.json({ error: 'Saknar behörighet.' }, { status: 401, headers: noStore });
  const now = Date.now();
  const b = await loadBriefing(now, { anonymous: true, token: key }).catch(() => null);
  if (!b) return NextResponse.json({ error: 'Rapporten kunde inte hämtas just nu.' }, { status: 502, headers: noStore });
  const text = briefingText({ name: b.name, now, weather: b.weather, parts: b.parts });
  return new URL(req.url).searchParams.get('format') === 'json'
    ? NextResponse.json({ text, parts: b.parts }, { headers: noStore })
    : new NextResponse(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8', ...noStore } });
}
