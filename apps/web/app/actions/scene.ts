'use server';
import { createClient } from '@/lib/supabase/server';

const SCENES = ['ljust', 'mys', 'slack'];
type Result = { ok: boolean; error?: string };

/** Anropar Homeys webhook "scen" (flödet kör DB Scen) och loggar kommandot. */
async function command(tag: Record<string, string>, log: Record<string, string>): Promise<Result> {
  if (process.env.NODE_ENV === 'development' && process.env.DEMO_DATA) return { ok: true };

  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: 'Inte inloggad' };
  const { data: allowed } = await sb.rpc('is_allowed');
  if (allowed !== true) return { ok: false, error: 'Saknar behörighet' };

  let ok = false;
  let error: string | undefined;
  const homeyId = process.env.HOMEY_ID;
  if (!homeyId) {
    error = 'HOMEY_ID saknas';
  } else {
    try {
      const res = await fetch(`https://webhook.homey.app/${homeyId}/scen?tag=${encodeURIComponent(JSON.stringify(tag))}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      });
      ok = res.ok;
      if (!ok) error = `Homey svarade ${res.status}`;
    } catch {
      error = 'Homey svarar inte';
    }
  }

  await sb.from('commands').insert({ ...log, ok, error: error ?? null });
  return { ok, error };
}

/** Ljust/Mys/Släck i ett rum. */
export async function runScene(zoneId: string, scene: string): Promise<Result> {
  if (!SCENES.includes(scene)) return { ok: false, error: 'Okänd scen' };
  return command({ zone: zoneId, scene }, { type: 'scene', zone_id: zoneId, scene });
}

/** Aktivera ett Homey-mood. */
export async function runMood(moodId: string): Promise<Result> {
  if (!/^[\w-]{1,64}$/.test(moodId)) return { ok: false, error: 'Ogiltigt mood' };
  return command({ mood: moodId }, { type: 'mood', mood_id: moodId });
}
