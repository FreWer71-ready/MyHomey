'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { FullscreenButton } from './FullscreenButton';
import { LegendButton } from './LegendButton';
import { RefreshButton } from './RefreshButton';
import { Icon, type IconName } from './Icon';

const ITEMS: { href: string; label: string; icon: IconName; ready: boolean }[] = [
  { href: '/', label: 'Hem', icon: 'home', ready: true },
  { href: '/rum', label: 'Rum', icon: 'rooms', ready: true },
  { href: '/energi', label: 'Energi', icon: 'bolt', ready: true },
  { href: '/historik', label: 'Historik', icon: 'chart', ready: true },
  { href: '/larm', label: 'Larm', icon: 'bell', ready: true },
];

const SEEN = 'seenAlarms';

/** Sant om något larm inte setts; besök på Larm markerar allt som sett. */
function useNewAlarms(alarms: string[], onLarm: boolean) {
  const [fresh, setFresh] = useState(false);
  const key = alarms.join('|');
  useEffect(() => {
    try {
      if (onLarm) {
        localStorage.setItem(SEEN, JSON.stringify(alarms));
        setFresh(false);
      } else {
        const seen = new Set<string>(JSON.parse(localStorage.getItem(SEEN) ?? '[]'));
        setFresh(alarms.some((a) => !seen.has(a)));
      }
    } catch {
      setFresh(alarms.length > 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, onLarm]);
  return fresh;
}

export function Nav({ alarms = [] }: { alarms?: string[] }) {
  const path = usePathname();
  const fresh = useNewAlarms(alarms, path.startsWith('/larm'));
  const active = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));
  return (
    <nav
      aria-label="Huvudmeny"
      className="fixed inset-x-0 bottom-0 z-10 flex gap-1 border-t border-line bg-glass p-2 md:sticky md:top-0 md:h-dvh md:overflow-y-auto md:border-t-0 md:border-r md:w-[88px] md:shrink-0 md:flex-col md:gap-2 md:px-2.5 md:py-4"
    >
      <div className="mx-auto mb-2 hidden size-12 items-center justify-center rounded-[18px] bg-sun text-ink md:flex">
        <Icon name="logo" size={30} />
      </div>
      {ITEMS.map((it) =>
        it.ready ? (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active(it.href) ? 'page' : undefined}
            className={`flex flex-1 flex-col items-center gap-1 rounded-[18px] py-2.5 text-[12px] md:flex-none ${
              active(it.href) ? 'bg-glass-hi font-extrabold text-sun ring-1 ring-sun/60' : 'font-bold text-dim'
            }`}
          >
            {it.href === '/larm' && fresh ? (
              <span className="relative">
                <Icon name="bellAlert" size={24} />
                <span className="absolute -top-0.5 -right-1 size-2.5 animate-ping rounded-full bg-danger" />
                <span className="absolute -top-0.5 -right-1 size-2.5 rounded-full bg-danger" />
              </span>
            ) : (
              <Icon name={it.icon} size={24} />
            )}
            {it.href === '/larm' && fresh ? <span className="text-danger">{it.label}</span> : it.label}
            {it.href === '/larm' && fresh && <span className="sr-only">, nya larm</span>}
          </Link>
        ) : (
          <span
            key={it.href}
            title="Kommer snart"
            className="flex flex-1 flex-col items-center gap-1 rounded-[18px] py-2.5 text-[12px] font-bold text-mute md:flex-none"
          >
            <Icon name={it.icon} size={24} />
            {it.label}
          </span>
        ),
      )}
      <div className="flex flex-1 md:mt-auto md:flex-none md:flex-col md:gap-1">
        <span className="hidden md:block">
          <LegendButton />
        </span>
        <RefreshButton />
        <span className="hidden md:block">
          <FullscreenButton />
        </span>
      </div>
    </nav>
  );
}
