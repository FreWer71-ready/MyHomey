'use server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/** Skickar inloggningslänk, men bara till adresser i app_users. */
export async function sendLink(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const sb = await createClient();
  const { data: allowed } = await sb.rpc('is_email_allowed', { e: email });
  if (allowed === true) {
    const h = await headers();
    const origin = h.get('origin') ?? `https://${h.get('host')}`;
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${origin}/auth/confirm` },
    });
    if (error) redirect('/login?status=error');
  }
  // Samma svar oavsett, så att ingen kan testa vilka adresser som finns.
  redirect('/login?status=sent');
}
