'use client';
import { useEffect, useState } from 'react';

import { Icon } from './Icon';

/** Det TV:n visar nu, i ett enhetligt format (Samsung/The Frame eller Google TV). */
export type TvView = {
  source: string;
  app: string | null;
  title: string | null;
  subtitle: string | null;
  status: 'playing' | 'paused' | 'art' | 'off' | 'on' | 'unknown';
};

export type PlayingItem = {
  key: string;
  kind: 'tv' | 'music';
  /** Källa, t.ex. "Google TV · Netflix" eller högtalarens namn. */
  label: string;
  title: string;
  subtitle: string | null;
  paused?: boolean;
};

/**
 * "Spelas nu" överst till höger på Hem: TV och högtalare i samma tonade platta.
 * Spelar flera samtidigt växlar raden lugnt var 8:e sekund.
 */
export function NowPlayingStrip({ items }: { items: PlayingItem[] }) {
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(true);
  useEffect(() => {
    if (items.length < 2) return;
    const t = setInterval(() => {
      setShown(false);
      setTimeout(() => { setI((n) => (n + 1) % items.length); setShown(true); }, 400);
    }, 8000);
    return () => clearInterval(t);
  }, [items.length]);
  if (!items.length) return null;
  const p = items[i % items.length];
  return (
    <div aria-live="polite" className={`np-card ${p.kind === 'tv' ? 'np-tv' : 'np-music'} relative flex h-16 min-w-0 items-center gap-3.5 overflow-hidden rounded-[18px] border border-line pl-3 pr-4`}>
      <div className={`flex min-w-0 grow items-center gap-3.5 transition-opacity duration-[400ms] ${shown ? 'opacity-100' : 'opacity-0'}`}>
        <span className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-black/30">
          <Icon name={p.kind === 'tv' ? 'tv' : 'music'} size={24} />
        </span>
        <span className="flex min-w-0 grow flex-col leading-tight">
          <span className="truncate text-[14px] text-white/75">{p.label}</span>
          <span className="truncate text-[21px] font-bold text-white">
            {p.title}{p.subtitle && <span className="text-[16px] font-semibold text-white/75"> · {p.subtitle}</span>}
          </span>
        </span>
        <span className={`flex shrink-0 items-center gap-2 rounded-full bg-black/30 px-3 py-1 text-[15px] font-semibold ${p.paused ? 'text-warn' : 'text-ok'}`}>
          {!p.paused && <span className="eq flex h-4 items-end gap-[2px]" aria-hidden="true"><span /><span /><span /></span>}
          {p.paused ? 'Pausad' : 'Spelar'}
        </span>
      </div>
      {items.length > 1 && (
        <span className="flex shrink-0 flex-col gap-1" aria-hidden="true">
          {items.map((x, n) => <span key={x.key} className={`size-1.5 rounded-full ${n === i % items.length ? 'bg-white' : 'bg-white/35'}`} />)}
        </span>
      )}
    </div>
  );
}
