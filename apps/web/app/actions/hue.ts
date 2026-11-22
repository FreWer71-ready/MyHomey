'use server';
import { createClient } from '@/lib/supabase/server';

// Hue-styrning utöver scener och enskilda lampor (bara Hue-hushåll, CONTROL=hue): hela rummet, släck mjukt,
// ljuseffekter, blinka och rörelsesensor på/av.
type Result = { ok: boolean; error?: string };
const ID = /^[\w-]{4,64}$/;

async function hue(body: Record<string, unknown>): Promise<Result> {
  if (process.env.NODE_ENV === 'development' && process.env.DEMO_DATA) return { ok: true };
  if (process.env.CONTROL !== 'hue') return { ok: false, error: 'Bara med Hue' };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: 'Inte inloggad' };
  const { data, error } = await sb.functions.invoke('hue', { body });
  return !error && data?.ok ? { ok: true } : { ok: false, error: 'Hue svarar inte' };
}

/** Hela rummet: på/av, ljusstyrka 0–1, eller släck mjukt på `fade` minuter. */
export async function hueRoom(zone: string, c: { on?: boolean; dim?: number; fade?: number }): Promise<Result> {
  if (!ID.test(zone)) return { ok: false, error: 'Ogiltigt rum' };
  if (c.dim !== undefined && !(c.dim >= 0 && c.dim <= 1)) return { ok: false, error: 'Ogiltig nivå' };
  if (c.fade !== undefined && !(c.fade > 0 && c.fade <= 60)) return { ok: false, error: 'Ogiltig tid' };
  return hue({ action: 'group', zone, ...c });
}

export async function hueEffect(id: string, effect: 'candle' | 'fire' | 'sparkle' | 'no_effect'): Promise<Result> {
  if (!ID.test(id) || !['candle', 'fire', 'sparkle', 'no_effect'].includes(effect)) return { ok: false, error: 'Ogiltigt' };
  return hue({ action: 'effect', id, effect });
}

export async function hueIdentify(id: string): Promise<Result> {
  if (!ID.test(id)) return { ok: false, error: 'Ogiltig lampa' };
  return hue({ action: 'identify', id });
}

export async function hueSensor(id: string, enabled: boolean): Promise<Result> {
  if (!ID.test(id)) return { ok: false, error: 'Ogiltig sensor' };
  return hue({ action: 'sensor', id, enabled });
}
