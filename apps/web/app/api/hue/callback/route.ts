import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { publicUrl } from '@/lib/paths';

/** Hue skickar tillbaka hit med en kod; edge-funktionen byter den mot nycklar och kopplar bryggan. */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const back = (r: string) => {
    const res = NextResponse.redirect(publicUrl(`/favoriter?hue=${r}`, req.nextUrl.origin));
    res.cookies.delete('hue_state');
    return res;
  };
  if (!code || !state || state !== req.cookies.get('hue_state')?.value) return back('fel');
  const sb = await createClient();
  const { data, error } = await sb.functions.invoke('hue', { body: { action: 'exchange', code } });
  return back(!error && data?.ok ? 'ok' : 'fel');
}
