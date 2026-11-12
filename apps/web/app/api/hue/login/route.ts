import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { publicUrl } from '@/lib/paths';

/** Startar inloggningen mot Philips Hue (OAuth). state skyddar mot förfalskade återanrop. */
export async function GET(req: NextRequest) {
  const state = crypto.randomUUID().replaceAll('-', '');
  const sb = await createClient();
  const { data, error } = await sb.functions.invoke('hue', { body: { action: 'authorize', state } });
  if (error || !data?.url) return NextResponse.redirect(publicUrl('/favoriter?hue=fel', req.nextUrl.origin));
  const res = NextResponse.redirect(data.url);
  res.cookies.set('hue_state', state, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 600 });
  return res;
}
