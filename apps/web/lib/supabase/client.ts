import { createBrowserClient } from '@supabase/ssr';
import { COOKIE_OPTIONS } from './cookie';

export const createClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookieOptions: COOKIE_OPTIONS },
  );
