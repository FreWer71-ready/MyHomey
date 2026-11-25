'use client';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { clearTrain, confirmLeg, confirmTrain, skipTrain, unconfirmLeg, unskipAll } from '@/app/actions/onboard';
import type { TransitLeg } from '@/lib/transit';

/**
 * Kryssruta-knapp: obockad = kantad ruta med tom ruta (inte ifylld), bockad = grön med ✓ ("På tåget"). Texten på obockade knappar har
 * ingen ✓, så den aldrig kan misstas för att redan vara bockad. Tryck växlar.
 */
function toggleClass(on: boolean, busy: boolean) {
  return `btn-row ${on ? '!bg-ok font-bold !text-ink' : 'btn-row-light'} ${busy ? 'animate-pulse' : ''}`;
}
const Box = ({ on }: { on: boolean }) => <span aria-hidden="true" className={`mr-1 inline-flex size-4 items-center justify-center rounded-[0.25rem] text-[0.75rem] leading-none font-black ${on ? 'bg-ink text-ok' : 'border-2 border-current'}`}>{on ? '✓' : ''}</span>;

/** "Jag är på tåget" (bekräftar tågläget på alla skärmar). Bekräftat: grön "På tåget" som ångras med ett tryck. */
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
    <button type="button" onClick={run} disabled={busy} aria-pressed={confirmed} aria-label={confirmed ? `På tåg ${ident}. Tryck för att ångra.` : `Jag är på tåg ${ident}`}
      className={toggleClass(confirmed, busy)}>
      {fail ? 'Försök igen' : <>{(!label || confirmed) && <Box on={confirmed} />}{confirmed ? 'På tåget' : label ?? 'Jag är på tåget'}</>}
    </button>
  );
}

/** Ett tåg i Dagens resa: bocka för att spara det i tåghistoriken (bara det du själv bekräftar). Tryck igen ångrar. */
export function LegOnTrain({ leg, saved }: { leg: TransitLeg; saved: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [fail, setFail] = useState(false);
  const [on, setOn] = useState(saved);
  useEffect(() => setOn(saved), [saved]);
  const run = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    start(async () => {
      const r = on ? await unconfirmLeg(leg.num!, leg.dep)
        : await confirmLeg({ ident: leg.num!, dep: leg.dep, arr: leg.arr, from: leg.from, to: leg.to, label: leg.label, fromAt: leg.fromAt, toAt: leg.toAt });
      setFail(!r.ok);
      if (r.ok) { setOn(!on); router.refresh(); }
    });
  };
  return (
    <button type="button" onClick={run} disabled={busy} aria-pressed={on} aria-label={on ? `Tåg ${leg.num} finns i historiken. Tryck för att ta bort.` : `Jag åker tåg ${leg.num}. Spara i historiken.`}
      className={toggleClass(on, busy)}>
      {fail ? 'Försök igen' : <><Box on={on} />{on ? `Tåg ${leg.num} sparat` : `Jag åker ${leg.num}`}</>}
    </button>
  );
}

/**
 * "Sitter du på tåg X?" med Ja (bekräftar tåget) och Nej (frågan döljs för det tåget; minns i webbläsaren).
 * Visas först när webbläsaren kollat att frågan inte redan avfärdats.
 */
export function JustLeftAsk({ ident, dep, arr, text }: { ident: string; dep: number; arr: number | null; text: string }) {
  const key = `ej-pa-tag:${ident}:${dep}`;
  const [state, setState] = useState<'wait' | 'ask' | 'no'>('wait');
  useEffect(() => {
    try { setState(localStorage.getItem(key) ? 'no' : 'ask'); } catch { setState('ask'); }
  }, [key]);
  if (state !== 'ask') return null;
  const no = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    try { localStorage.setItem(key, '1'); } catch { /* minns inte */ }
    setState('no');
  };
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-[1rem]">
      <span>{text}</span>
      <span className="flex shrink-0 gap-2">
        <OnTrainButton ident={ident} dep={dep} arr={arr} label="Ja" />
        <button type="button" onClick={no} className="btn-row btn-row-quiet">Nej</button>
      </span>
    </div>
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
      className={`btn-row ${busy ? 'animate-pulse' : ''} ${className}`}>
      {fail ? 'Försök igen' : label}
    </button>
  );
}

/** "Dölj": avgången visas inte längre (man tar inte det tåget). */
export function SkipButton({ ident, dep, time, compact }: { ident: string; dep: number; time: string; compact?: boolean }) {
  return <ActionButton act={() => skipTrain(ident, dep)} label={compact ? '✕' : 'Dölj'} aria={`Dölj avgången ${time}, tåg ${ident}`} className={compact ? 'btn-row-danger w-9 !px-0' : 'btn-row-quiet'} />;
}

/** Visa dolda avgångar igen. */
export function UnskipButton({ count }: { count: number }) {
  return <ActionButton act={unskipAll} label={`Visa ${count} dolda`} aria={`Visa ${count} dolda avgångar igen`} />;
}
