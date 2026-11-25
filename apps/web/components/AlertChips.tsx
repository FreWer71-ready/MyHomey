'use client';
import { useState } from 'react';
import Link from 'next/link';

import { Icon, type IconName } from './Icon';

/** En varning på Hem: kort rubrik (text) och detalj under. Samma form för alla; nivån styr färg och form. */
export type Alert = { id: string; level: 'yellow' | 'orange' | 'red'; icon: IconName | '!'; text: string; detail?: string; href: string };

const RANK = { red: 0, orange: 1, yellow: 2 } as const;
const NAME = { yellow: 'Gul varning', orange: 'Orange varning', red: 'Röd varning' } as const;
/** Bara en varning dominerar: röd = kräver åtgärd, gul/orange = agera snart (bärnsten). Övriga är dämpad information. */
const DOMINANT = {
  red: 'border-[#F85149]/70 bg-[#F85149]/15 shadow-[inset_3px_0_0_#F85149]',
  orange: 'border-sun/60 bg-sun/10 shadow-[inset_3px_0_0_#F5B437]',
  yellow: 'border-sun/60 bg-sun/10 shadow-[inset_3px_0_0_#F5B437]',
} as const;

/** Rad för varningar: en kompakt horisontell platta; `actions` (Läs upp, Ringa mobilen) ligger till höger. */
export function AlertBar({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="surface flex flex-wrap items-center gap-x-4 gap-y-2 p-2 lg:flex-nowrap">
      {children}
      <div className="ml-auto flex shrink-0 flex-wrap gap-2 empty:hidden max-lg:w-full max-lg:[&>*]:flex-1">{actions}</div>
    </div>
  );
}

/**
 * Varningar i en rad: den viktigaste (dominerande) först, den näst viktigaste dämpad, resten bakom "+N".
 * Rangordning: röd, orange, gul. Detaljerna finns på sidan bakom varningen.
 */
export function AlertChips({ alerts, actions }: { alerts: Alert[]; actions?: React.ReactNode }) {
  const [all, setAll] = useState(false);
  const sorted = [...alerts].sort((a, b) => RANK[a.level] - RANK[b.level]);
  const [first, second, ...more] = sorted;
  const hiddenN = more.length;
  const ico = (a: Alert, size: number) => a.icon === '!' ? <span className="text-[1.25rem] leading-none font-black">!</span> : <Icon name={a.icon} size={size} />;
  return (
    <AlertBar actions={actions}>
      <Link href={first.href} role="alert" aria-label={`${NAME[first.level]}: ${first.text}${first.detail ? `, ${first.detail}` : ''}. Visa detaljer.`}
        className={`alert-in row-hit flex min-h-12 min-w-0 items-center gap-3 rounded-xl border px-3 py-1.5 max-lg:w-full ${DOMINANT[first.level]}`}>
        <span aria-hidden="true" className={first.level === 'red' ? 'text-danger' : 'text-sun'}>{ico(first, 26)}</span>
        <span className="flex min-w-0 flex-col leading-tight lg:flex-row lg:items-baseline lg:gap-3">
          <span className="text-[1.1875rem] font-bold whitespace-nowrap">{first.text}</span>
          {first.detail && <span className="truncate text-[0.9375rem] text-fg/80">{first.detail}</span>}
        </span>
        <span aria-hidden="true" className="chev ml-auto pl-1 text-[1.25rem] leading-none text-dim">›</span>
      </Link>
      {second && (
        <Link href={second.href} aria-label={`${NAME[second.level]}: ${second.text}${second.detail ? `, ${second.detail}` : ''}. Visa detaljer.`}
          className="row-hit flex min-h-12 min-w-0 items-center gap-2.5 rounded-xl px-2 text-dim">
          <span aria-hidden="true">{ico(second, 22)}</span>
          <span className="flex min-w-0 flex-col leading-tight lg:flex-row lg:items-baseline lg:gap-2">
            <span className="text-[1rem] font-semibold whitespace-nowrap text-fg/90">{second.text}</span>
            {second.detail && <span className="truncate text-[0.9375rem]">{second.detail}</span>}
          </span>
        </Link>
      )}
      {hiddenN > 0 && (
        <button type="button" onClick={() => setAll((v) => !v)} aria-expanded={all} className="btn min-h-11 px-3 text-[0.9375rem] text-dim">
          {all ? 'Färre' : `+${hiddenN}`}
        </button>
      )}
      {all && more.length > 0 && (
        <ul className="alert-in -mt-1 flex basis-full flex-col border-t border-line pt-1">
          {more.map((a) => (
            <li key={a.id}>
              <Link href={a.href} className="row-hit flex min-h-11 items-center gap-2.5 rounded-lg px-2 text-dim">
                <span aria-hidden="true">{ico(a, 20)}</span>
                <span className="text-[1rem] font-semibold text-fg/90">{a.text}</span>
                {a.detail && <span className="truncate text-[0.9375rem]">{a.detail}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AlertBar>
  );
}
