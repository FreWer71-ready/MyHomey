import { NextResponse } from 'next/server';
import { CAL_TTL, calendarConfigured, loadCalendarServer } from '@/lib/calendar-source';
import { shareAllowed } from '@/lib/calendar-mirror';

// Delar den här dashboardens kalendervy med en annan dashboard (server till server, nyckel i CALENDAR_SHARE_TOKEN).
// Släpps förbi inloggningen i middleware.ts; nyckeln är skyddet.
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!shareAllowed(req.headers.get('authorization'))) return NextResponse.json({ error: 'Saknar behörighet.' }, { status: 401 });
  const cal = calendarConfigured() ? await loadCalendarServer() : null;
  return cal
    ? NextResponse.json(cal, { headers: { 'Cache-Control': `private, max-age=${CAL_TTL}` } })
    : NextResponse.json({ error: 'Kalendern kunde inte hämtas just nu.' }, { status: 502 });
}
