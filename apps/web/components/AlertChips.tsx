'use client';
import { useState } from 'react';
import Link from 'next/link';

import { Icon, type IconName } from './Icon';

/** En varning på Hem. Samma form för alla; bara nivån styr färgen. */
export type Alert = { id: string; level: 'yellow' | 'orange' | 'red'; icon: IconName | '!'; text: string; href: string };

const RANK = { red: 0, orange: 1, yellow: 2 } as const;
// Gul/orange: tonad platta med färgad kant och ikon. Röd: helfylld och pulserar svagt.
const STYLE = {
  yellow: { box: 'border-[#E3A008]/45 bg-[#E3A008]/15 text-fg', icon: '#E3A008', mark: '●', name: 'Gul varning' },
  orange: { box: 'border-[#F0883E]/50 bg-[#F0883E]/18 text-fg', icon: '#F0883E', mark: '◆', name: 'Orange varning' },
  red: { box: 'alert-pulse border-[#F85149] bg-[#DA3633] text-white', icon: '#FFFFFF', mark: '▲', name: 'Röd varning' },
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
          <Link key={a.id} href={a.href} role="alert" aria-label={`${st.name}: ${a.text}. Visa detaljer.`}
            className={`flex min-h-14 min-w-0 items-center gap-3 rounded-[0.875rem] border px-4 py-2 text-[1.0625rem] font-semibold leading-snug ${st.box}`}>
            <span aria-hidden="true" className="w-4 shrink-0 text-center text-[1rem]" style={{ color: st.icon }}>{st.mark}</span>
            {a.icon === '!'
              ? <span aria-hidden="true" className="flex size-[1.375rem] shrink-0 items-center justify-center rounded-full text-[0.875rem] font-black text-[#0B0F14]" style={{ background: st.icon }}>!</span>
              : <span aria-hidden="true" className="shrink-0" style={{ color: st.icon }}><Icon name={a.icon} size={24} /></span>}
            <span className="min-w-0 grow">{a.text}</span>
            <span aria-hidden="true" className="shrink-0 text-[1.25rem] leading-none">›</span>
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
