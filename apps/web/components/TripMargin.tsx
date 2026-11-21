'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setTripMargin } from '@/app/actions/prefs';

const OPTIONS = [0, 5, 10, 15, 20, 30, 45, 60];

/** Diskret val: hur långt före just den här kalenderhändelsen man vill vara framme (sparas på enheten). */
export function TripMargin({ eventKey, value }: { eventKey: string; value: number | null }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <label className={`flex min-h-11 items-center gap-2 text-[0.875rem] text-dim ${busy ? 'animate-pulse' : ''}`}>
      Vill vara där
      <select value={value ?? ''} disabled={busy} aria-label="Hur långt före händelsen du vill vara framme"
        onChange={(e) => { const v = e.target.value === '' ? null : Number(e.target.value); start(async () => { if ((await setTripMargin(eventKey, v)).ok) router.refresh(); }); }}
        className="min-h-9 rounded-lg border border-line bg-transparent px-2 font-semibold text-fg">
        <option value="">automatiskt</option>
        {OPTIONS.map((m) => <option key={m} value={m}>{m === 0 ? 'precis i tid' : `${m} min före`}</option>)}
      </select>
    </label>
  );
}
