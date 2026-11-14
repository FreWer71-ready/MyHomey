import Link from 'next/link';

import { Icon, type IconName } from './Icon';

/** En varning på Hem. Samma form för alla; bara nivån styr färgen. */
export type Alert = { id: string; level: 'yellow' | 'orange' | 'red'; icon: IconName | '!'; text: string; href: string };

const RANK = { red: 0, orange: 1, yellow: 2 } as const;
// Gul/orange: tonad platta med färgad kant och ikon. Röd: helfylld och pulserar svagt.
const STYLE = {
  yellow: { box: 'border-[#E3A008]/45 bg-[#E3A008]/15 text-fg', icon: '#E3A008' },
  orange: { box: 'border-[#F0883E]/50 bg-[#F0883E]/18 text-fg', icon: '#F0883E' },
  red: { box: 'alert-pulse border-[#F85149] bg-[#DA3633] text-white', icon: '#FFFFFF' },
} as const;

/** Varningsrad: allvarligast först, högst `max` plattor + "+N" som leder till Larm. */
export function AlertChips({ alerts, max = 3 }: { alerts: Alert[]; max?: number }) {
  const sorted = [...alerts].sort((a, b) => RANK[a.level] - RANK[b.level]);
  const shown = sorted.slice(0, max);
  const rest = sorted.length - shown.length;
  return (
    <div className="flex flex-col gap-2 lg:flex-row">
      {shown.map((a) => {
        const st = STYLE[a.level];
        return (
          <Link key={a.id} href={a.href} role="alert" className={`flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-[14px] border px-3.5 text-[16px] font-semibold ${st.box}`}>
            {a.icon === '!'
              ? <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full text-[14px] font-black text-[#0B0F14]" style={{ background: st.icon }}>!</span>
              : <span className="shrink-0" style={{ color: st.icon }}><Icon name={a.icon} size={22} /></span>}
            <span className="truncate">{a.text}</span>
          </Link>
        );
      })}
      {rest > 0 && (
        <Link href="/larm" className="flex h-11 shrink-0 items-center justify-center rounded-[14px] border border-line bg-card px-4 text-[16px] font-semibold text-dim">+{rest}</Link>
      )}
    </div>
  );
}
