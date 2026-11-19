'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { clearTrain, confirmTrain } from '@/app/actions/onboard';

/** "Jag är på tåget" (bekräftar tågläget på alla skärmar) eller, när det är bekräftat, "Inte på tåget". */
export function OnTrainButton({ ident, dep, arr, confirmed = false, label }: { ident: string; dep: number; arr: number | null; confirmed?: boolean; label?: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [fail, setFail] = useState(false);
  const run = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    start(async () => {
      const r = confirmed ? await clearTrain() : await confirmTrain(ident, dep, arr);
      setFail(!r.ok);
      if (r.ok) router.refresh();
    });
  };
  return (
    <button type="button" onClick={run} disabled={busy} aria-label={confirmed ? `Inte på tåg ${ident}` : `Jag är på tåg ${ident}`}
      className={`pill h-9 px-3 text-[0.875rem] ${confirmed ? '' : 'bg-sun font-bold text-ink'} ${busy ? 'animate-pulse' : ''}`}>
      {fail ? 'Försök igen' : label ?? (confirmed ? 'Inte på tåget' : 'Jag är på tåget ✓')}
    </button>
  );
}
