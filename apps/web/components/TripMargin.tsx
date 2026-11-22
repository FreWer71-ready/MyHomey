'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setTripMargin } from '@/app/actions/prefs';

// "Auto" = 5 min, 15 min för resor på minst 30 min.
const OPTIONS: { v: number | null; label: string }[] = [
  { v: null, label: 'Auto' }, { v: 0, label: 'I tid' }, { v: 5, label: '5' }, { v: 10, label: '10' },
  { v: 15, label: '15' }, { v: 30, label: '30' }, { v: 60, label: '60' },
];

/** Hur långt före just den här kalenderhändelsen man vill vara framme: tydliga knappar, gäller bara händelsen. */
export function TripMargin({ eventKey, value, auto }: { eventKey: string; value: number | null; auto: number }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [cur, setCur] = useState(value);
  const pick = (v: number | null) => {
    setCur(v);
    start(async () => { if ((await setTripMargin(eventKey, v)).ok) router.refresh(); });
  };
  return (
    <div className={`flex flex-col gap-1.5 border-t border-line pt-3 ${busy ? 'animate-pulse' : ''}`}>
      <p id={`marg-${eventKey}`} className="text-[0.9375rem] font-semibold text-dim">
        Vill vara framme {cur == null ? `(auto ${auto} min före)` : cur === 0 ? 'precis i tid' : `${cur} min före`}
      </p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby={`marg-${eventKey}`}>
        {OPTIONS.map((o) => (
          <button key={o.label} type="button" disabled={busy} aria-pressed={cur === o.v} onClick={() => pick(o.v)}
            className={`pill min-h-11 min-w-11 justify-center px-3 text-[0.9375rem] ${cur === o.v ? 'on' : ''}`}>
            {o.label}
          </button>
        ))}
        <span className="self-center text-[0.875rem] text-dim">min före</span>
      </div>
    </div>
  );
}
