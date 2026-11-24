'use client';
import { useEffect, useRef } from 'react';

/**
 * Händelsen som "Uppdatera"-knappen skickar. Öppna planer (dörr till dörr) hämtar då mobilens plats på nytt och räknas om, men bara
 * om de visas (platsfrågan kommer alltså bara vid tryck på Uppdatera och bara när en plan är aktuell).
 */
export const UPPDATERA = 'myhomey:uppdatera';
export const skickaUppdatera = () => window.dispatchEvent(new Event(UPPDATERA));

/** Kör `fn` varje gång någon trycker på Uppdatera. */
export function useUppdatera(fn: () => void) {
  const last = useRef(fn);
  useEffect(() => { last.current = fn; });
  useEffect(() => {
    const h = () => last.current();
    window.addEventListener(UPPDATERA, h);
    return () => window.removeEventListener(UPPDATERA, h);
  }, []);
}
