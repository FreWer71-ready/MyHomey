import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CAL_TTL } from '@/lib/calendar-source';
import { loadMirrorServer, mirrorConfigured } from '@/lib/calendar-mirror';

// Speglad kalender från en annan dashboard (lib/calendar-mirror.ts). Kräver inloggning som /api/calendar.
export const dynamic = 'force-dynamic';

const fail = (status: number, error: string) =>
  NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET() {
  if (!mirrorConfigured()) return fail(404, 'Ingen speglad kalender är kopplad.');
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return fail(401, 'Logga in för att se kalendern.');
  const cal = await loadMirrorServer();
  return cal
    ? NextResponse.json(cal, { headers: { 'Cache-Control': `private, max-age=${CAL_TTL}` } })
    : fail(502, 'Kalendern kunde inte hämtas just nu.');
}
