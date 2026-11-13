import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { mergeCalendars, parseCalendar, type Calendar } from '@/lib/calendar';

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
  // Flera kalendrar: adresserna separeras med mellanslag, komma eller radbrytning.
  const urls = url.split(/[\s,]+/).filter(Boolean);
  const parsed = await Promise.all(urls.map(async (u, i) => {
    try {
      // Next cachar varje flöde i 10 min (delas mellan serverinstanser), minnet ovan sparar tolkningen.
      const res = await fetch(u, { next: { revalidate: TTL }, signal: AbortSignal.timeout(10_000) });
      const text = res.ok ? await res.text() : '';
      if (text.trimStart().startsWith('BEGIN:VCALENDAR')) return parseCalendar(text);
      console.error(`Kalender ${i + 1}: oväntat svar (status ${res.status})`);
    } catch (e) {
      // Bara feltypen loggas: meddelandet kan innehålla adressen.
      console.error(`Kalender ${i + 1}: hämtningen misslyckades (${(e as Error)?.name ?? 'fel'})`);
    }
    return null;
  }));
  const okCals = parsed.filter((c): c is Calendar => !!c);
  if (!okCals.length) return fail(502, 'Kalendern kunde inte hämtas just nu.');
  // Behåll källordningen (färgen per kalender) även om någon misslyckas.
  const merged = mergeCalendars(parsed.map((c) => c ?? { days: okCals[0].days.map((d) => ({ date: d.date, allDay: [], timed: [] })), generated: 0 }));
  memo = { at: Date.now(), cal: merged };
  return ok(merged);
}

function ok(cal: Calendar) {
  return NextResponse.json(cal, { headers: { 'Cache-Control': `private, max-age=${TTL}` } });
}
