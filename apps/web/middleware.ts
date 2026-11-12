import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { publicUrl } from './lib/paths';
import { COOKIE_OPTIONS } from './lib/supabase/cookie';

const PUBLIC = ['/login', '/auth'];

export async function middleware(request: NextRequest) {
  if (process.env.NODE_ENV === 'development' && process.env.DEMO_DATA) return NextResponse.next();
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: COOKIE_OPTIONS,
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  // Spärr per adress: HOUSEHOLD anger vilket hushåll den här dashboarden visar.
  // Ett konto från ett annat hushåll loggas ut och får ett meddelande på inloggningssidan.
  if (user && process.env.HOUSEHOLD) {
    const { data: hh } = await supabase.rpc('my_household');
    if (hh !== process.env.HOUSEHOLD) {
      await supabase.auth.signOut({ scope: 'local' });
      const redirect = NextResponse.redirect(publicUrl('/login?status=konto', request.nextUrl.origin));
      response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
      return redirect;
    }
  }

  if (!user && !PUBLIC.some((p) => path.startsWith(p))) {
    const redirect = NextResponse.redirect(publicUrl('/login', request.nextUrl.origin));
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }
  return response;
}

export const config = {
  matcher: ['/', '/((?!_next/static|_next/image|bg/|favicon.ico|icon.svg|icon-192.png|icon-512.png|manifest.webmanifest).*)'],
};
