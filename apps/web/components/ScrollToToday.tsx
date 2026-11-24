'use client';
import { useEffect } from 'react';

/** Hoppar till dagens rad (id="idag") när sidan öppnas, så att listan inte börjar den 1:a i månaden. */
export function ScrollToToday() {
  useEffect(() => { document.getElementById('idag')?.scrollIntoView({ block: 'start' }); }, []);
  return null;
}
