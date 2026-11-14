'use client';
import { useEffect } from 'react';

import { BASE_PATH } from '@/lib/paths';

/** Registrerar service workern (krävs för "Installera app" i bl.a. Samsung Internet). */
export function RegisterSW() {
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register(`${BASE_PATH}/sw.js`, { scope: `${BASE_PATH}/` }).catch(() => {});
  }, []);
  return null;
}
