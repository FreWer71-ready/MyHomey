import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { publicUrl } from '@/lib/paths';
import { createClient } from '@/lib/supabase/server';

/** Tar emot inloggningslänken (PKCE-kod eller token_hash) och skapar sessionen. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get('code');
  const tokenHash = params.get('token_hash');
  const type = params.get('type') as EmailOtpType | null;
  const sb = await createClient();

  let ok = false;
  if (code) ok = !(await sb.auth.exchangeCodeForSession(code)).error;
  else if (tokenHash && type) ok = !(await sb.auth.verifyOtp({ token_hash: tokenHash, type })).error;

  return NextResponse.redirect(publicUrl(ok ? '/' : '/login?status=error', request.nextUrl.origin), 303);
}
