'use client';
import { useState } from 'react';
import Link from 'next/link';

import { Icon, type IconName } from './Icon';

/** En varning på Hem. Samma form för alla; bara nivån styr färgen. */
export type Alert = { id: string; level: 'yellow' | 'orange' | 'red'; icon: IconName | '!'; text: string; href: string };

const RANK = { red: 0, orange: 1, yellow: 2 } as const;
// Gul/orange: tonad platta med färgad kant och ikon. Röd: helfylld och pulserar svagt.
const STYLE = {
  // Helfyllda plattor (tydliga på håll); mörk text på gul/orange, vit på röd (kontrast ≥ 4.5:1).
  yellow: { box: 'border-[#F2C94C] bg-[#F2C94C] text-[#0B0F14]', icon: '#0B0F14', bang: '#F2C94C', mark: '●', name: 'Gul varning' },
  orange: { box: 'border-[#F0883E] bg-[#F0883E] text-[#0B0F14]', icon: '#0B0F14', bang: '#F0883E', mark: '◆', name: 'Orange varning' },
  red: { box: 'alert-pulse border-[#F85149] bg-[#DA3633] text-white', icon: '#FFFFFF', bang: '#DA3633', mark: '▲', name: 'Röd varning' },
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
            className={`flex min-h-16 min-w-0 items-center gap-3 rounded-[0.875rem] border py-2 pr-4 pl-3 text-[1.0625rem] font-semibold leading-snug ${st.box}`}>
            {/* Nivå (form) stort, ikonen i en mörk platta så att den syns på alla färger. */}
            <span aria-hidden="true" className="w-7 shrink-0 text-center text-[1.75rem] leading-none" style={{ color: st.icon }}>{st.mark}</span>
            <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-[0.75rem] bg-[#0B0F14] text-white">
              {a.icon === '!'
                ? <span className="text-[1.75rem] leading-none font-black" style={{ color: st.bang === '#DA3633' ? '#FF7B72' : st.bang }}>!</span>
                : <Icon name={a.icon} size={34} />}
            </span>
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
