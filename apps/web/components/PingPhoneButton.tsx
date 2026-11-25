'use client';
import { useState, useTransition } from 'react';
import { pingPhone } from '@/app/actions/ping';

/** "Ringa mobilen" (Android via ntfy) för en person på Hitta. */
export function PingPhoneButton({ first, label = 'Ringa mobilen', className = '' }: { first: string; label?: string; className?: string }) {
  const [busy, start] = useTransition();
  const [st, setSt] = useState<{ ok: boolean; msg?: string } | null>(null);
  return (
    <button
      type="button" disabled={busy}
      onClick={() => start(async () => { const r = await pingPhone(first); setSt({ ok: r.ok, msg: r.error }); setTimeout(() => setSt(null), 5000); })}
      aria-label={`Ringa ${first}s mobil`}
      className={`btn min-h-12 shrink-0 px-4 text-[0.9375rem] ${className} ${busy ? 'animate-pulse' : ''} ${st?.ok ? 'text-ok' : st ? 'text-danger' : ''}`}
    >
      {st?.ok ? 'Ringer ✓' : st ? (st.msg ?? 'Gick inte') : label}
    </button>
  );
}
