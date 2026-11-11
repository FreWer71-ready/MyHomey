'use server';
import { createClient } from '@/lib/supabase/server';

const SCENES = ['ljust', 'mys', 'slack'];

/** Kör Ljust/Mys/Släck i ett rum via Homeys webhook och loggar kommandot. */
export async function runScene(zoneId: string, scene: string): Promise<{ ok: boolean; error?: string }> {
  if (!SCENES.includes(scene)) return { ok: false, error: 'Okänd scen' };
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
    const tag = encodeURIComponent(JSON.stringify({ zone: zoneId, scene }));
    try {
      const res = await fetch(`https://webhook.homey.app/${homeyId}/scen?tag=${tag}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      });
      ok = res.ok;
      if (!ok) error = `Homey svarade ${res.status}`;
    } catch {
      error = 'Homey svarar inte';
    }
  }

  await sb.from('commands').insert({ type: 'scene', zone_id: zoneId, scene, ok, error: error ?? null });
  return { ok, error };
}
