'use client';
import { useState, useTransition } from 'react';

import { runDevice } from '@/app/actions/scene';

/** "Spela ljud" på en Hitta-pryl (Apple Hitta via Homey). */
export function SoundButton({ id }: { id: string }) {
  const [busy, start] = useTransition();
  const [st, setSt] = useState<'ok' | 'error' | null>(null);
  return (
    <button
      type="button" disabled={busy}
      onClick={() => start(async () => { const r = await runDevice(id, 'send_sound', true); setSt(r.ok ? 'ok' : 'error'); setTimeout(() => setSt(null), 4000); })}
      className={`pill h-11 shrink-0 px-4 text-[15px] ${busy ? 'animate-pulse' : ''} ${st === 'ok' ? 'text-ok' : st === 'error' ? 'text-danger' : ''}`}
    >
      {st === 'ok' ? 'Ljud skickat ✓' : st === 'error' ? 'Gick inte' : 'Spela ljud'}
    </button>
  );
}
