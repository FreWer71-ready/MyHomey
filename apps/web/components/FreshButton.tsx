'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { BASE_PATH } from '@/lib/paths';

/**
 * "Hämta färsk data": hämtar kalendrar och trafik direkt från källorna (i stället för de som hämtats i bakgrunden)
 * och laddar om sidan. Tar några sekunder, så knappen säger det.
 */
export function FreshButton({ className = '' }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState(false);
  const run = async () => {
    setBusy(true); setFail(false);
    try {
      const r = await fetch(`${BASE_PATH}/api/refresh`, { method: 'POST' });
      if (!r.ok && r.status !== 207) setFail(true);
    } catch { setFail(true); }
    router.refresh();
    setBusy(false);
  };
  return (
    <button type="button" onClick={run} disabled={busy} aria-live="polite"
      className={`btn min-h-12 shrink-0 px-4 text-[0.9375rem] ${className} ${busy ? 'animate-pulse' : ''} ${fail ? 'text-danger' : ''}`}>
      {busy ? 'Hämtar … kan ta upp mot 10 s' : fail ? 'Gick inte, försök igen' : '↻ Färsk data · upp mot 10 s'}
    </button>
  );
}
