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
  { href: '/favoriter', label: 'Favoriter', icon: 'star', ready: true },
  { href: '/energi', label: 'Energi', icon: 'bolt', ready: true },
  { href: '/pendling', label: 'Pendling', icon: 'train', ready: true },
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

/** Platta: menyn tonas bort efter 10 s utan aktivitet (mot inbränning) och kommer tillbaka vid tryck. */
function useIdle(ms = 10_000) {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const wake = () => { setIdle(false); clearTimeout(t); t = setTimeout(() => setIdle(true), ms); };
    wake();
    const ev = ['pointerdown', 'pointermove', 'keydown', 'touchstart'] as const;
    ev.forEach((e) => window.addEventListener(e, wake, { passive: true }));
    return () => { clearTimeout(t); ev.forEach((e) => window.removeEventListener(e, wake)); };
  }, [ms]);
  return idle;
}

export function Nav({ alarms = [] }: { alarms?: string[] }) {
  const path = usePathname();
  const idle = useIdle();
  const fresh = useNewAlarms(alarms, path.startsWith('/larm'));
  const active = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));
  return (
    <nav
      aria-label="Huvudmeny"
      className={`fixed inset-x-0 bottom-0 z-20 flex gap-1 border-t border-line bg-ground p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:sticky md:top-0 md:h-dvh md:w-16 md:shrink-0 md:flex-col md:gap-1 md:overflow-y-auto md:border-t-0 md:border-r md:bg-transparent md:px-2 md:py-4 md:transition-opacity md:duration-700 ${
        idle ? 'lg:pointer-events-none lg:opacity-0' : ''}`}
    >
      {ITEMS.filter((it) => it.href !== '/pendling' || process.env.NEXT_PUBLIC_COMMUTE !== 'off')
        // Bara väg (utan tåg): sidan heter Trafik.
        .map((it) => (it.href === '/pendling' && process.env.NEXT_PUBLIC_COMMUTE === 'road' ? { ...it, label: 'Trafik', icon: 'road' as IconName } : it))
        .map((it) =>
        it.ready ? (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active(it.href) ? 'page' : undefined}
            title={it.label}
            className={`flex flex-1 flex-col items-center gap-1 rounded-[14px] py-2.5 text-[12px] md:flex-none ${
              active(it.href) ? 'bg-card font-bold text-fg' : 'text-dim'
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
            <span className={`md:sr-only ${it.href === '/larm' && fresh ? 'text-danger' : ''}`}>{it.label}</span>
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
