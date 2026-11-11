'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/** Hämtar om sidan när värden ändras i Supabase (högst var 3:e sekund). */
export function LiveRefresh() {
  const router = useRouter();
  useEffect(() => {
    const sb = createClient();
    let pending: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (pending) return;
      pending = setTimeout(() => {
        pending = undefined;
        router.refresh();
      }, 3000);
    };
    const channel = sb
      .channel('capability_state')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'capability_state' }, refresh)
      .subscribe();
    // Reserv om Realtime tappar anslutningen.
    const fallback = setInterval(() => router.refresh(), 5 * 60_000);
    return () => {
      sb.removeChannel(channel);
      clearInterval(fallback);
      if (pending) clearTimeout(pending);
    };
  }, [router]);
  return null;
}
