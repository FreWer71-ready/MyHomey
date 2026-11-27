import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { BASE_PATH, publicUrl } from './lib/paths';
import { COOKIE_OPTIONS } from './lib/supabase/cookie';

// /api/calendar/share och /api/briefing skyddas av egna nycklar (server till server, utan inloggning).
// /api/refresh kontrollerar själv: nyckel från pg_cron (prövas av databasen) eller inloggning.
const PUBLIC = ['/login', '/auth', '/api/calendar/share', '/api/briefing', '/api/refresh'];
// Hushållskontrollen sparas 10 min i en kaka (per användare och hushåll) i stället för ett databasanrop vid varje sidhopp.
const HH_COOKIE = `hh-ok-${BASE_PATH.replace(/\W/g, '')}`;

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

  // getClaims kontrollerar JWT:ns signatur lokalt (inget nätanrop per sidhopp; faller tillbaka på Auth-servern om projektet har symmetrisk nyckel).
  const { data: auth } = await supabase.auth.getClaims();
  const sub = auth?.claims?.sub;
  const user = sub ? { id: sub } : null;
  const path = request.nextUrl.pathname;

  // Spärr per adress: HOUSEHOLD anger vilket hushåll den här dashboarden visar.
  // Ett konto från ett annat hushåll loggas ut och får ett meddelande på inloggningssidan.
  if (user && process.env.HOUSEHOLD) {
    const ok = `${user.id}:${process.env.HOUSEHOLD}`;
    if (request.cookies.get(HH_COOKIE)?.value !== ok) {
      const { data: hh } = await supabase.rpc('my_household');
      if (hh !== process.env.HOUSEHOLD) {
        await supabase.auth.signOut({ scope: 'local' });
        const redirect = NextResponse.redirect(publicUrl('/login?status=konto', request.nextUrl.origin));
        response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
        redirect.cookies.delete(HH_COOKIE);
        return redirect;
      }
      response.cookies.set(HH_COOKIE, ok, { httpOnly: true, sameSite: 'lax', secure: true, path: COOKIE_OPTIONS?.path ?? '/', maxAge: 600 });
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
  matcher: ['/', '/((?!_next/static|_next/image|bg/|favicon.ico|icon.svg|icon-192.png|icon-512.png|manifest.webmanifest|sw.js).*)'],
};
