'use client';
import { useEffect, useRef, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { BASE_PATH } from '@/lib/paths';

type Flags = Window & { __SIDA_SPARAD?: number; __SIDA_LEVANDE?: number };
const send = (maxAgeS: number) => navigator.serviceWorker?.controller?.postMessage({ type: 'spara', url: location.pathname + location.search, maxAgeS });
const clearAndReload = () => { const r = () => location.reload(); try { caches.delete('sidor-v1').then(r, r); } catch { r(); } };

/**
 * Sparad sida (service worker `public/sw.js`): sidan som senast laddades visas direkt, och här hämtas uppdaterad info på plats
 * (`router.refresh()`) medan "Laddar" markeras på det som uppdateras (`data-laddar` på <html>, se globals.css). Efteråt sparas den
 * nya versionen. Slingskydd: hämtas sidan om igen inom 15 s (ny version på servern) rensas de sparade sidorna och sidan laddas om.
 * Bara i produktion.
 */
export function SparadSida() {
  const router = useRouter();
  const path = usePathname();
  const [pending, start] = useTransition();
  const phase = useRef<'idle' | 'busy'>('idle');

  useEffect(() => {
    const w = window as Flags;
    w.__SIDA_LEVANDE = 1;
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register(`${BASE_PATH}/sw.js`, { scope: `${BASE_PATH}/` }).catch(() => {});
    if (!w.__SIDA_SPARAD) return;
    try {
      if (Date.now() - Number(sessionStorage.getItem('sida-ref') ?? 0) < 15_000) return clearAndReload();
      sessionStorage.setItem('sida-ref', String(Date.now()));
    } catch { /* utan sessionStorage: ingen slingskydd, men uppdateringen körs ändå */ }
    start(() => router.refresh());
  }, [router]);

  useEffect(() => { document.documentElement.toggleAttribute('data-laddar', pending); }, [pending]);

  // Uppdateringen klar: spara den nya versionen (högst var 20:e sekund).
  useEffect(() => {
    if (pending) phase.current = 'busy';
    else if (phase.current === 'busy') { phase.current = 'idle'; send(20); }
  }, [pending]);

  // Sidor som besöks (även med menyn) sparas när de inte sparats på 10 min.
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    const t = setTimeout(() => send(600), 4000);
    return () => clearTimeout(t);
  }, [path]);

  return null;
}
