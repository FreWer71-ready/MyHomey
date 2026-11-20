'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { BASE_PATH } from '@/lib/paths';
import { delayText, whereNow, type TrainPath } from '@/lib/trainpath';

const hm = (ms: number) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit' }).format(ms);

/** Hela sträckan som tidslinje (stationer och driftplatser) i en ruta i body (kortet runt kan vara en länk). */
function TrainTimeline({ id, ident, p, box }: { id: string; ident: string; p: TrainPath | null; box: React.RefObject<HTMLDivElement | null> }) {
  if (typeof document === 'undefined') return null;
  // Rutan ligger i body men React-händelser bubblar ändå till förälderkomponenten (ofta en länk till Pendling):
  // stoppa dem så att Stäng eller tryck utanför bara stänger rutan.
  return createPortal(<div ref={box} id={id} popover="auto" onClick={(e) => e.stopPropagation()} className="m-auto max-h-[88dvh] w-[min(94vw,560px)] overflow-hidden rounded-[20px] bg-card p-0 text-fg shadow-2xl backdrop:bg-black/60">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="text-[20px] font-semibold">Tåg {ident}</h2>
          <button type="button" popoverTarget={id} popoverTargetAction="hide" className="pill">Stäng</button>
        </div>
        {!p ? <p className="animate-pulse px-5 py-4 text-[1rem] text-dim">Hämtar sträckan …</p> : (
        <ol className="max-h-[calc(88dvh-72px)] overflow-y-auto px-5 py-3">
          {p.stops.map((s) => {
            const here = s.sig === p.last?.sig;
            return (
              <li key={s.sig} className={`flex items-center gap-3 py-1.5 ${s.station ? '' : 'text-[15px]'}`}>
                <span className="flex w-5 shrink-0 justify-center">
                  <span className={`rounded-full ${s.station ? 'size-3' : 'size-2'} ${here ? 'bg-ok ring-4 ring-ok/30' : s.passed ? 'bg-dim' : 'border-2 border-dim'}`} />
                </span>
                <span className={`min-w-0 grow truncate ${s.station ? 'font-semibold' : 'text-dim'} ${s.canceled ? 'line-through' : ''}`}>{s.name}</span>
                <span className="w-12 shrink-0 text-right text-dim tabular-nums">{hm(s.planned)}</span>
                <span className="w-32 shrink-0 whitespace-nowrap text-right tabular-nums">
                  {s.passed && s.actual != null ? <span className="font-semibold">✓ {hm(s.actual)}</span> : s.est != null ? hm(s.est) : ''}
                  {s.delay != null && Math.abs(s.delay) >= 1 && <span className={`ml-1 text-[13px] ${s.delay >= 3 ? 'text-warn' : 'text-dim'}`}>{delayText(s.delay)}</span>}
                </span>
              </li>
            );
          })}
        </ol>)}
      </div>, document.body);
}

/** "Sträckan ›": hämtar tågets alla mellanliggande punkter först vid tryck (för alla tåg, oavsett avgångstid). */
export function TrainRoute({ ident, children, className = '' }: { ident: string; children?: React.ReactNode; className?: string }) {
  const [p, setP] = useState<TrainPath | null>(null);
  // Rutan skapas först vid första tryck (annars skiljer sig serverns och webbläsarens HTML åt).
  const [shown, setShown] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const id = `strecka-${ident}`;
  useEffect(() => { if (shown) box.current?.showPopover(); }, [shown]);
  const open = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    setShown((n) => n + 1);
    fetch(`${BASE_PATH}/api/train/${ident}`).then((r) => (r.ok ? r.json() : null)).then((d) => d?.stops && setP(d)).catch(() => {});
  };
  return (
    <>
      {children
        ? <button type="button" onClick={open} aria-label={`Tåg ${ident}: visa hela sträckan`} className={`w-full text-left ${className}`}>{children}</button>
        : <button type="button" onClick={open} className="btn-row">Sträckan ›</button>}
      {shown > 0 && <TrainTimeline id={id} ident={ident} p={p} box={box} />}
    </>
  );
}

/**
 * Var tåget är nu ("Passerade Valskog 14:47 · +8 min"), uppdateras varje minut. Tryck: hela sträckan som tidslinje
 * med stationer och driftplatser; passerade bockas av med verklig tid och avvikelse.
 */
export function TrainProgress({ ident }: { ident: string }) {
  const [p, setP] = useState<TrainPath | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const id = `tag-${ident}`;
  useEffect(() => {
    let alive = true;
    const load = () => fetch(`${BASE_PATH}/api/train/${ident}`).then((r) => (r.ok ? r.json() : null)).then((d) => alive && d?.stops && setP(d)).catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [ident]);
  const text = p ? whereNow(p) : null;
  if (!p || !text) return null;
  const late = (p.last?.delay ?? 0) >= 3;
  return (
    <>
      <button
        type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); box.current?.showPopover(); }}
        className="flex min-w-0 items-center gap-2 text-left text-[0.9375rem] font-semibold"
      >
        <span className="relative flex size-2.5 shrink-0"><span className="absolute inset-0 animate-ping rounded-full bg-ok/60" /><span className="relative size-2.5 rounded-full bg-ok" /></span>
        <span className={`truncate ${late ? 'text-warn' : 'text-fg'}`}>{text}</span>
        <span className="shrink-0 text-dim">›</span>
      </button>
      <TrainTimeline id={id} ident={ident} p={p} box={box} />
    </>
  );
}
