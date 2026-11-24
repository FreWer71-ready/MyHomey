import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Spotify-kortet: läget (GET) och styrning (POST {action, device?, pct?}) via edge-funktionen spotify.
export const dynamic = 'force-dynamic';
const ACTIONS = new Set(['play', 'pause', 'next', 'previous', 'volume', 'transfer']);

async function call(body: Record<string, unknown>) {
  const sb = await createClient();
  const { data, error } = await sb.functions.invoke('spotify', { body });
  if (error) {
    const msg = await (error as { context?: Response }).context?.json?.().catch(() => null);
    return NextResponse.json({ error: msg?.error ?? 'Spotify svarar inte' }, { status: 502 });
  }
  return NextResponse.json(data);
}

export async function GET() {
  return call({ action: 'status' });
}

export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  if (!b || !ACTIONS.has(b.action)) return NextResponse.json({ error: 'Okänd åtgärd' }, { status: 400 });
  return call({ action: b.action, device: b.device, pct: b.pct });
}
