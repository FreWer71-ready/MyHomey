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
 * "Spelas nu" överst till höger på Hem: TV och högtalare i samma rad.
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
    <div aria-live="polite" className="-mb-1 flex min-w-0 items-center gap-2.5 text-[16px] leading-6 lg:justify-end">
      <div className={`flex min-w-0 items-center gap-2.5 transition-opacity duration-[400ms] ${shown ? 'opacity-100' : 'opacity-0'}`}>
        <span className={`np-card ${p.kind === 'tv' ? 'np-tv' : 'np-music'} flex size-6 shrink-0 items-center justify-center rounded-[8px]`}>
          <Icon name={p.kind === 'tv' ? 'tv' : 'music'} size={15} />
        </span>
        <span className="shrink-0 text-dim">{p.label}</span>
        <span className="min-w-0 truncate font-semibold">
          {p.title}{p.subtitle && <span className="font-normal text-dim"> · {p.subtitle}</span>}
        </span>
        {p.paused
          ? <span className="shrink-0 text-[15px] font-semibold text-warn">Pausad</span>
          : <span className="eq flex h-4 shrink-0 items-end gap-[2px]" aria-hidden="true"><span /><span /><span /></span>}
      </div>
      {items.length > 1 && (
        <span className="flex shrink-0 gap-1" aria-hidden="true">
          {items.map((x, n) => <span key={x.key} className={`size-1.5 rounded-full ${n === i % items.length ? 'bg-fg' : 'bg-mute/50'}`} />)}
        </span>
      )}
    </div>
  );
}
