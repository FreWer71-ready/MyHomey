'use client';
import { useState } from 'react';
import Link from 'next/link';

import { Icon, type IconName } from './Icon';

/** En varning på Hem: kort rubrik (text) och detalj under. Samma form för alla; nivån styr färg och form. */
export type Alert = { id: string; level: 'yellow' | 'orange' | 'red'; icon: IconName | '!'; text: string; detail?: string; href: string };

const RANK = { red: 0, orange: 1, yellow: 2 } as const;
// Mörk, tonad platta med färgad kant (tjock till vänster) och ikonruta i nivåns färg; vit text (kontrast ≥ 7:1).
// Röd sticker ut mest: starkare platta och svag puls. Formen (▲ ◆ ●) i ikonrutans hörn – nivån syns utan färg.
const STYLE = {
  yellow: { box: 'border-[#E3B341] bg-[#3A3212]', tile: '#7A6414', mark: '●', markColor: '#F2C94C', name: 'Gul varning' },
  orange: { box: 'border-[#F0883E] bg-[#45260E]', tile: '#9A4A12', mark: '◆', markColor: '#F0883E', name: 'Orange varning' },
  red: { box: 'alert-pulse border-[#FF6B61] bg-[#6E1A17]', tile: '#C9302C', mark: '▲', markColor: '#FF7B72', name: 'Röd varning' },
} as const;

/**
 * Varningar: allvarligast först, en per rad i full bredd (ingen text kapas), stora tryckytor. Högst `max` syns;
 * resten fälls ut på plats med "+N varningar till" (ingen rotation – man ska inte missa något vid en snabb blick).
 * Nivån visas med form (▲ ◆ ●) och färg; detaljerna finns på sidan bakom varningen.
 */
export function AlertChips({ alerts, max = 2 }: { alerts: Alert[]; max?: number }) {
  const [all, setAll] = useState(false);
  const sorted = [...alerts].sort((a, b) => RANK[a.level] - RANK[b.level]);
  const shown = all ? sorted : sorted.slice(0, max);
  const rest = sorted.length - Math.min(sorted.length, max);
  return (
    <div className="flex flex-col gap-2">
      {shown.map((a) => {
        const st = STYLE[a.level];
        return (
          <Link key={a.id} href={a.href} role="alert" aria-label={`${st.name}: ${a.text}${a.detail ? `, ${a.detail}` : ''}. Visa detaljer.`}
            className={`flex h-[4.5rem] min-w-0 items-center gap-3 rounded-[0.875rem] border border-l-[6px] py-2 pr-4 pl-3 text-white ${st.box}`}>
            <span aria-hidden="true" className="relative flex size-12 shrink-0 items-center justify-center rounded-[0.75rem]" style={{ background: st.tile }}>
              {a.icon === '!' ? <span className="text-[1.75rem] leading-none font-black">!</span> : <Icon name={a.icon} size={32} />}
              <span className="absolute -top-1.5 -left-1.5 flex size-6 items-center justify-center rounded-full bg-[#0B0F14] text-[0.875rem] leading-none" style={{ color: st.markColor }}>{st.mark}</span>
            </span>
            <span className="flex min-w-0 grow flex-col leading-tight">
              <span className="overflow-hidden text-[1.1875rem] font-bold text-ellipsis whitespace-nowrap">{a.text}</span>
              {a.detail && <span className="overflow-hidden text-[0.9375rem] text-ellipsis whitespace-nowrap text-white/85">{a.detail}</span>}
            </span>
            <span aria-hidden="true" className="shrink-0 text-[1.375rem] leading-none">›</span>
          </Link>
        );
      })}
      {rest > 0 && (
        <button type="button" onClick={() => setAll((v) => !v)} aria-expanded={all}
          className="flex min-h-12 items-center justify-center rounded-[0.875rem] border border-line bg-card px-4 text-[1rem] font-semibold text-fg">
          {all ? 'Visa färre' : `+${rest} ${rest === 1 ? 'varning' : 'varningar'} till`}
        </button>
      )}
    </div>
  );
}
