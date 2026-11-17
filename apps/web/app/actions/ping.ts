'use server';
import { createClient } from '@/lib/supabase/server';

// "Ringa mobilen" via ntfy (Android): brådskande notis som larmar tills den stängs (appens upprepade larm).
// NTFY_TOPICS = "Ulrika=<hemlig kanal>,Fredrik=<...>" (förnamn=kanal), NTFY_SERVER (standard https://ntfy.sh).
// Kanalnamnen är hemliga: den som känner till en kanal kan pinga telefonen. De får aldrig hamna i loggar eller svar.

function topics(): Map<string, string> {
  return new Map((process.env.NTFY_TOPICS ?? '').split(',').map((x) => x.split('=').map((s) => s.trim()))
    .filter(([n, t]) => n && t && /^[\w-]{12,64}$/.test(t)).map(([n, t]) => [n.toLowerCase(), t]));
}

/** Förnamn som har en mobil att pinga (för knappen på Hitta). */
export async function pingableNames(): Promise<string[]> {
  return [...topics().keys()];
}

export async function pingPhone(first: string): Promise<{ ok: boolean; error?: string }> {
  const topic = topics().get(first.toLowerCase());
  if (!topic) return { ok: false, error: 'Ingen mobil kopplad' };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: 'Inte inloggad' };
  const { data: allowed } = await sb.rpc('is_allowed');
  if (allowed !== true) return { ok: false, error: 'Saknar behörighet' };
  try {
    const res = await fetch(`${process.env.NTFY_SERVER || 'https://ntfy.sh'}/${topic}`, {
      method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(8000),
      headers: { Title: 'Hitta mobilen', Priority: 'urgent', Tags: 'rotating_light,mag' },
      body: 'Här är jag! Larmet skickades från dashboarden – stäng det här.',
    });
    return res.ok ? { ok: true } : { ok: false, error: `ntfy svarade ${res.status}` };
  } catch {
    return { ok: false, error: 'ntfy svarar inte' };
  }
}
