import { NextResponse } from 'next/server';
import { buildCalendar, calendarConfigured } from '@/lib/calendar-source';
import { monthsWindow } from '@/lib/calendar-view';
import { calKey, household, writeSnapshot } from '@/lib/snapshot-source';
import { createClient, SUPABASE_URL } from '@/lib/supabase/server';

// Hämtar data i förväg och sparar den i tabellen snapshots, så att Hem läser färdigt i stället för att anropa källorna.
// Anropas av pg_cron (header x-refresh-secret = cron_secret ur Vault; databasen kontrollerar den, webben sparar ingen egen)
// och av knappen "Hämta färsk data" (inloggad). ?what=trafik | cal | all (standard all).
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: Request) {
  const secret = req.headers.get('x-refresh-secret');
  const what = new URL(req.url).searchParams.get('what') ?? 'all';
  if (!secret) {
    const sb = await createClient();
    const { data } = await sb.auth.getClaims();
    if (!data?.claims) return NextResponse.json({ error: 'Logga in' }, { status: 401 });
  }
  const t0 = Date.now();
  const done: Record<string, boolean> = {};

  if (what === 'trafik' || what === 'all') {
    // Med nyckeln anropas trafik-funktionen direkt (x-cron-secret), annars som den inloggade användaren.
    const raw = secret
      ? await fetch(`${SUPABASE_URL}/functions/v1/trafik`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cron-secret': secret }, body: '{}', signal: AbortSignal.timeout(15_000) })
        .then((r) => (r.ok ? r.json() : null)).catch(() => null)
      : await (await createClient()).functions.invoke('trafik', { body: {} }).then((r) => r.data).catch(() => null);
    done.trafik = !!raw && !raw.error && await writeSnapshot('*', 'trafik', raw, secret);
  }

  if ((what === 'cal' || what === 'all') && calendarConfigured() && household()) {
    // Hems fönster (idag + 30 dagar) och Kalender-sidans två månader.
    const w = monthsWindow();
    for (const range of [{ back: 0, days: 30 }, { back: w.back, days: w.ahead }]) {
      const cal = await buildCalendar(range).catch(() => null);
      done[calKey(range)] = !!cal && await writeSnapshot(household(), calKey(range), cal, secret);
    }
  }

  const ok = Object.values(done).every(Boolean);
  console.info(`Uppdatera ${Object.entries(done).map(([k, v]) => `${k}=${v ? 'ok' : 'fel'}`).join(' ')} ms=${Date.now() - t0}`);
  // 207: något gick inte att spara (sidan visar då det som fanns).
  return NextResponse.json({ ok, done, ms: Date.now() - t0 }, { status: ok ? 200 : 207 });
}
