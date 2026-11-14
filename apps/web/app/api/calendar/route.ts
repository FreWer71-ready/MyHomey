import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { Calendar } from '@/lib/calendar';
import { CAL_TTL, calendarConfigured, loadCalendarServer } from '@/lib/calendar-source';

// Google-kalender via hemlig iCal-adress per installation. Google blockerar anrop från webbläsaren,
// så flödet hämtas på servern (lib/calendar-source.ts). Adressen får aldrig hamna i loggar, felmeddelanden eller svar.
export const dynamic = 'force-dynamic';

const fail = (status: number, error: string) =>
  NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET() {
  if (!calendarConfigured()) return fail(404, 'Ingen kalender är kopplad.');

  // Inloggning krävs (middleware spärrar redan, detta är ett extra skydd för API-anrop).
  const demo = process.env.NODE_ENV === 'development' && !!process.env.DEMO_DATA;
  if (!demo) {
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return fail(401, 'Logga in för att se kalendern.');
  }

  const cal = await loadCalendarServer();
  return cal ? ok(cal) : fail(502, 'Kalendern kunde inte hämtas just nu.');
}

function ok(cal: Calendar) {
  return NextResponse.json(cal, { headers: { 'Cache-Control': `private, max-age=${CAL_TTL}` } });
}
