'use client';
import { useEffect, useState } from 'react';

import { BASE_PATH } from '@/lib/paths';

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
const KEY = 'install-dismissed';

/**
 * Registrerar service workern och visar en egen "Installera som app"-knapp när webbläsaren erbjuder det
 * (Chrome/Samsung Internet på Android). Döljs i installerad app och om man tackat nej.
 */
export function RegisterSW() {
  const [evt, setEvt] = useState<InstallEvent | null>(null);
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register(`${BASE_PATH}/sw.js`, { scope: `${BASE_PATH}/` }).catch(() => {});
    let dismissed = false;
    try { dismissed = localStorage.getItem(KEY) === '1'; } catch { /* privat läge */ }
    const on = (e: Event) => { e.preventDefault(); if (!dismissed) setEvt(e as InstallEvent); };
    const done = () => setEvt(null);
    window.addEventListener('beforeinstallprompt', on);
    window.addEventListener('appinstalled', done);
    return () => { window.removeEventListener('beforeinstallprompt', on); window.removeEventListener('appinstalled', done); };
  }, []);
  if (!evt) return null;
  const close = () => { try { localStorage.setItem(KEY, '1'); } catch { /* privat läge */ } setEvt(null); };
  return (
    <div className="fixed inset-x-4 bottom-24 z-50 mx-auto flex max-w-md items-center gap-3 rounded-[18px] border border-line bg-card p-3 pl-5 shadow-2xl md:bottom-6">
      <span className="grow text-[16px] font-semibold">Installera som app</span>
      <button type="button" onClick={close} className="pill h-11 px-4 text-[16px] text-dim">Inte nu</button>
      <button
        type="button"
        onClick={async () => { await evt.prompt(); await evt.userChoice; setEvt(null); }}
        className="h-11 rounded-full bg-fg px-5 text-[16px] font-semibold text-ground"
      >Installera</button>
    </div>
  );
}
