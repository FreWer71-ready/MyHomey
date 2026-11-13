import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseCalendar, type Calendar } from '@/lib/calendar';

// Google-kalender via hemlig iCal-adress per installation (CALENDAR_ICAL_URL, för Ulrika även ULRIKA_ICAL_URL). Bara på servern.
// Google blockerar anrop från webbläsaren, så flödet hämtas här. Adressen får aldrig
// hamna i loggar, felmeddelanden eller svar.
export const dynamic = 'force-dynamic';

const TTL = 600; // 10 minuter
let memo: { at: number; cal: Calendar } | null = null;

const fail = (status: number, error: string) =>
  NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET() {
  const url = process.env.CALENDAR_ICAL_URL || process.env.ULRIKA_ICAL_URL;
  if (!url) return fail(404, 'Ingen kalender är kopplad.');

  // Inloggning krävs (middleware spärrar redan, detta är ett extra skydd för API-anrop).
  const demo = process.env.NODE_ENV === 'development' && !!process.env.DEMO_DATA;
  if (!demo) {
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return fail(401, 'Logga in för att se kalendern.');
  }

  if (memo && Date.now() - memo.at < TTL * 1000) return ok(memo.cal);
  try {
    // Next cachar själva flödet i 10 min (delas mellan serverinstanser), minnet ovan sparar tolkningen.
    const res = await fetch(url, { next: { revalidate: TTL }, signal: AbortSignal.timeout(10_000) });
    const text = res.ok ? await res.text() : '';
    if (!text.trimStart().startsWith('BEGIN:VCALENDAR')) {
      console.error(`Kalender: oväntat svar (status ${res.status})`);
      return fail(502, 'Kalendern kunde inte hämtas just nu.');
    }
    memo = { at: Date.now(), cal: parseCalendar(text) };
    return ok(memo.cal);
  } catch (e) {
    // Bara feltypen loggas: meddelandet kan innehålla adressen.
    console.error(`Kalender: hämtningen misslyckades (${(e as Error)?.name ?? 'fel'})`);
    return fail(502, 'Kalendern kunde inte hämtas just nu.');
  }
}

function ok(cal: Calendar) {
  return NextResponse.json(cal, { headers: { 'Cache-Control': `private, max-age=${TTL}` } });
}
