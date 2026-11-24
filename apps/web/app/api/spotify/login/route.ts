import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { publicUrl } from '@/lib/paths';

/** Startar inloggningen mot Spotify (OAuth). state skyddar mot förfalskade återanrop. */
export async function GET(req: NextRequest) {
  const state = crypto.randomUUID().replaceAll('-', '');
  const redirect = publicUrl('/api/spotify/callback', req.nextUrl.origin).toString();
  const sb = await createClient();
  const { data, error } = await sb.functions.invoke('spotify', { body: { action: 'authorize', state, redirect } });
  if (error || !data?.url) return NextResponse.redirect(publicUrl('/favoriter?spotify=fel', req.nextUrl.origin));
  const res = NextResponse.redirect(data.url);
  res.cookies.set('spotify_state', state, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 600 });
  return res;
}
