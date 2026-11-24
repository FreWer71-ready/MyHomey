import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { publicUrl } from '@/lib/paths';

/** Spotify skickar tillbaka hit med en kod; edge-funktionen byter den mot nycklar. */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const back = (r: string) => {
    const res = NextResponse.redirect(publicUrl(`/favoriter?spotify=${r}`, req.nextUrl.origin));
    res.cookies.delete('spotify_state');
    return res;
  };
  if (!code || !state || state !== req.cookies.get('spotify_state')?.value) return back('fel');
  const redirect = publicUrl('/api/spotify/callback', req.nextUrl.origin).toString();
  const sb = await createClient();
  const { data, error } = await sb.functions.invoke('spotify', { body: { action: 'exchange', code, redirect } });
  return back(!error && data?.ok ? 'ok' : 'fel');
}
