'use client';
import { useEffect, useState } from 'react';

/**
 * Byter mellan Standard (tre kolumner, text 1×) och Stor (två kolumner, större text). Valet sparas på enheten.
 * Läget ligger som data-mode/data-cols på <html> och textskalan i --ui-scale (se app/layout.tsx).
 */
export function ModeButton() {
  const [big, setBig] = useState(false);
  useEffect(() => setBig(document.documentElement.dataset.mode === 'stor'), []);

  const toggle = () => {
    const d = document.documentElement;
    const next = d.dataset.mode === 'stor' ? 'standard' : 'stor';
    d.dataset.mode = next;
    d.dataset.cols = next === 'stor' ? '2' : '3';
    d.style.setProperty('--ui-scale', next === 'stor' ? d.dataset.big ?? '1.4' : '1');
    try { localStorage.setItem('ui-mode', next); } catch { /* privat läge: gäller bara nu */ }
    setBig(next === 'stor');
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={big}
      aria-label={big ? 'Normal textstorlek' : 'Större text'}
      className="flex w-full flex-col items-center gap-1 rounded-[1.125rem] py-2.5 text-[0.75rem] font-bold text-dim"
    >
      <span aria-hidden="true" className="flex h-6 items-end gap-0.5 font-extrabold leading-none text-fg">
        <span className="text-[0.875rem]">A</span><span className={big ? 'text-[1.5rem] text-sun' : 'text-[1.25rem]'}>A</span>
      </span>
      <span className="md:sr-only">{big ? 'Normal' : 'Större'}</span>
    </button>
  );
}
