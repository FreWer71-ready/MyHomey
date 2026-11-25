'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { TransitLeg } from '@/lib/transit';
import { clearFocusTrip, setFocusTrip } from '@/app/actions/focus';

/** "Välj som dagens resa": resan ersätter pendlingsförslagen på Hem och Pendling resten av dagen. */
export function FocusTripButton({ legs, to, home }: { legs: TransitLeg[]; to: string; home: boolean }) {
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();
  const pick = () => start(async () => {
    setErr(null);
    const r = await setFocusTrip(legs, to, home);
    if (r.ok) { setDone(true); router.refresh(); } else setErr(r.error ?? 'Resan kunde inte sparas');
  });
  return (
    <div className="flex flex-col gap-1">
      <button type="button" onClick={pick} disabled={busy || done} aria-pressed={done}
        className={`btn-row ${done ? 'sel' : 'btn-row-light'} w-full justify-center ${busy ? 'animate-pulse' : ''}`}>
        {done ? 'Dagens resa ✓' : 'Välj som dagens resa'}
      </button>
      {err && <p role="alert" className="text-[0.875rem] text-danger">{err}</p>}
    </div>
  );
}

/** "Släpp resan": tillbaka till de vanliga förslagen. */
export function ClearFocusButton({ className = '' }: { className?: string }) {
  const [busy, start] = useTransition();
  const router = useRouter();
  return (
    <button type="button" disabled={busy} onClick={() => start(async () => { await clearFocusTrip(); router.refresh(); })}
      className={`btn-row btn-row-quiet ${busy ? 'animate-pulse' : ''} ${className}`}>
      Släpp resan
    </button>
  );
}
