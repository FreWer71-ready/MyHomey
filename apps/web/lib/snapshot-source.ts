import 'server-only';
import { createClient as createAnon } from '@supabase/supabase-js';
import { createClient, SUPABASE_KEY, SUPABASE_URL } from './supabase/server';

// Bakgrundshämtad data i tabellen snapshots (fylls av /api/refresh, som pg_cron anropar, och av "Hämta färsk data").
// Hem läser färdig JSON med en databasfråga i stället för att anropa källorna (kalendrar, Trafikverket) vid varje sidladdning.

/** Hushållets id (fredrik, ulrika) för kalenderdata; '*' är gemensam data. */
export const household = () => process.env.HOUSEHOLD ?? '';
export const calKey = (r: { back: number; days: number }) => `cal:${r.back}:${r.days}`;

/** Läser en sparad post om den är högst `maxAgeMs` gammal. Null utan inloggning, vid fel eller om den är för gammal. */
export async function readSnapshot<T>(owner: string, key: string, maxAgeMs: number): Promise<{ data: T; at: number } | null> {
  if (!owner) return null;
  try {
    const sb = await createClient();
    const { data } = await sb.from('snapshots').select('data,updated_at').eq('household_id', owner).eq('key', key).maybeSingle();
    const at = data ? Date.parse(data.updated_at as string) : NaN;
    return data && Date.now() - at <= maxAgeMs ? { data: data.data as T, at } : null;
  } catch {
    return null;
  }
}

/**
 * Sparar en post. Med `secret` (bakgrundsjobbet, cron_secret ur pg_cron) via put_snapshot, som själv kontrollerar nyckeln;
 * annars som inloggad användare via put_my_snapshot (eget hushålls kalender och gemensam trafik).
 */
export async function writeSnapshot(owner: string, key: string, data: unknown, secret?: string | null): Promise<boolean> {
  try {
    if (secret) {
      const anon = createAnon(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
      const { data: ok } = await anon.rpc('put_snapshot', { p_secret: secret, p_household: owner, p_key: key, p_data: data });
      return ok === true;
    }
    const sb = await createClient();
    const { data: ok } = await sb.rpc('put_my_snapshot', { p_key: key, p_data: data });
    return ok === true;
  } catch {
    return false;
  }
}
