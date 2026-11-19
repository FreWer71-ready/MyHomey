'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { clearTrain, confirmTrain, skipTrain, unskipAll } from '@/app/actions/onboard';

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

/** Liten knapp som kör en serveråtgärd och hämtar om sidan (stoppar klicket så att kort-länken inte öppnas). */
function ActionButton({ act, label, aria, className = '' }: { act: () => Promise<{ ok: boolean }>; label: string; aria: string; className?: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [fail, setFail] = useState(false);
  return (
    <button type="button" disabled={busy} aria-label={aria}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); start(async () => { const r = await act(); setFail(!r.ok); if (r.ok) router.refresh(); }); }}
      className={`pill h-9 px-3 text-[0.875rem] ${busy ? 'animate-pulse' : ''} ${className}`}>
      {fail ? 'Försök igen' : label}
    </button>
  );
}

/** "Dölj": avgången visas inte längre (man tar inte det tåget). */
export function SkipButton({ ident, dep, time, compact }: { ident: string; dep: number; time: string; compact?: boolean }) {
  return <ActionButton act={() => skipTrain(ident, dep)} label={compact ? '✕' : 'Dölj'} aria={`Dölj avgången ${time}, tåg ${ident}`} className={compact ? 'w-9 justify-center !px-0' : ''} />;
}

/** Visa dolda avgångar igen. */
export function UnskipButton({ count }: { count: number }) {
  return <ActionButton act={unskipAll} label={`Visa ${count} dolda`} aria={`Visa ${count} dolda avgångar igen`} />;
}
