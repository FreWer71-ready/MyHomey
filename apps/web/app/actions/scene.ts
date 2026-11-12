'use server';
import { createClient } from '@/lib/supabase/server';

const SCENES = ['ljust', 'mys', 'slack'];
type Result = { ok: boolean; error?: string };

/** Anropar Homeys webhook "scen" (flödet kör DB Scen) och loggar kommandot. */
async function command(tag: Record<string, string>, log: Record<string, unknown>): Promise<Result> {
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

export type LightCommand = { on?: boolean; dim?: number; temp?: number; hue?: number; sat?: number };

/** Styr en enskild lampa: av/på, ljusstyrka, färgtemperatur eller färg (värden 0–1). */
export async function runLight(deviceId: string, c: LightCommand): Promise<Result> {
  if (!/^[\w-]{1,64}$/.test(deviceId)) return { ok: false, error: 'Ogiltig lampa' };
  const tag: Record<string, string> = { device: deviceId };
  if (typeof c.on === 'boolean') tag.on = String(c.on);
  for (const k of ['dim', 'temp', 'hue', 'sat'] as const) {
    const v = c[k];
    if (v === undefined) continue;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) return { ok: false, error: `Ogiltigt värde för ${k}` };
    tag[k] = String(Math.round(v * 1000) / 1000);
  }
  if (Object.keys(tag).length === 1) return { ok: false, error: 'Inget att ändra' };
  return command(tag, { type: 'light', device_id: deviceId, payload: c });
}

/** Starta ett Homey-flow (vanligt eller avancerat). */
export async function runFlow(flowId: string, advanced: boolean): Promise<Result> {
  if (!/^[\w-]{1,64}$/.test(flowId)) return { ok: false, error: 'Ogiltigt flow' };
  return command({ flow: flowId, advanced: String(advanced) }, { type: 'flow', flow_id: flowId });
}

/** Aktivera en Hue-scen (statisk eller dynamisk) via edge-funktionen hue. */
export async function runHueScene(sceneId: string, dynamic: boolean): Promise<Result> {
  if (!/^[\w-]{1,64}$/.test(sceneId)) return { ok: false, error: 'Ogiltig scen' };
  if (process.env.NODE_ENV === 'development' && process.env.DEMO_DATA) return { ok: true };
  const sb = await createClient();
  const { data, error } = await sb.functions.invoke('hue', { body: { action: 'activate', id: sceneId, dynamic } });
  return error || !data?.ok ? { ok: false, error: 'Hue svarar inte' } : { ok: true };
}
