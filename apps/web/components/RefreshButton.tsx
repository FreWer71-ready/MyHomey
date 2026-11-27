'use client';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { skickaUppdatera } from '@/lib/uppdatera';
import { BASE_PATH } from '@/lib/paths';
import { Icon } from './Icon';

/**
 * Hämtar om sidans data utan att lämna helskärm (fungerar även i installerad app). Öppna dörr till dörr-planer hämtar ny plats och räknas om.
 * Steg 1: sidan laddas om direkt med sparad data. Steg 2: färsk kalender och trafik hämtas från källorna (`/api/refresh`, upp mot 10 s)
 * medan ikonen snurrar, och sidan laddas om igen när den är klar.
 */
export function RefreshButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [spin, setSpin] = useState(false);
  const [fresh, setFresh] = useState(false);

  useEffect(() => {
    if (!pending && !fresh) {
      const t = setTimeout(() => setSpin(false), 400);
      return () => clearTimeout(t);
    }
  }, [pending, fresh]);

  const refresh = async () => {
    if (fresh) return;
    setSpin(true);
    setFresh(true);
    skickaUppdatera();
    start(() => router.refresh());
    try {
      const r = await fetch(`${BASE_PATH}/api/refresh`, { method: 'POST' });
      if (r.ok || r.status === 207) start(() => router.refresh());
    } catch { /* sparad data visas redan */ }
    setFresh(false);
  };

  return (
    <button
      type="button"
      onClick={refresh}
      aria-label="Uppdatera"
      aria-busy={pending || fresh}
      className={`flex flex-1 flex-col items-center gap-1 rounded-[1.125rem] py-2.5 text-[0.75rem] font-bold text-dim md:w-full md:flex-none`}
    >
      <Icon name="refresh" size={24} className={spin ? 'animate-spin' : ''} />
      <span className="md:sr-only big:max-md:sr-only">Uppdatera</span>
    </button>
  );
}
