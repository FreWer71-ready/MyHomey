'use server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { publicUrl } from '@/lib/paths';

/**
 * Inloggning med lösenord, eller inloggningslänk om lösenordet lämnas tomt.
 * Bara adresser i app_users släpps igenom.
 */
export async function signIn(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const sb = await createClient();
  const { data: allowed } = await sb.rpc('is_email_allowed', { e: email });

  if (password) {
    if (allowed !== true) redirect('/login?status=badlogin');
    const { error } = await sb.auth.signInWithPassword({ email, password });
    redirect(error ? '/login?status=badlogin' : '/');
  }

  if (allowed === true) {
    const h = await headers();
    const origin = h.get('origin') ?? `https://${h.get('host')}`;
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: publicUrl('/auth/confirm', origin).toString() },
    });
    if (error) redirect(error.status === 429 ? '/login?status=ratelimit' : '/login?status=error');
  }
  // Samma svar oavsett, så att ingen kan testa vilka adresser som finns.
  redirect('/login?status=sent');
}
