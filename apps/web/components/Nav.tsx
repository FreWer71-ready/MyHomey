'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FullscreenButton } from './FullscreenButton';
import { Icon, type IconName } from './Icon';

const ITEMS: { href: string; label: string; icon: IconName; ready: boolean }[] = [
  { href: '/', label: 'Hem', icon: 'home', ready: true },
  { href: '/rum', label: 'Rum', icon: 'rooms', ready: true },
  { href: '/energi', label: 'Energi', icon: 'bolt', ready: true },
  { href: '/historik', label: 'Historik', icon: 'chart', ready: true },
  { href: '/larm', label: 'Larm', icon: 'bell', ready: false },
];

export function Nav() {
  const path = usePathname();
  const active = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));
  return (
    <nav
      aria-label="Huvudmeny"
      className="fixed inset-x-0 bottom-0 z-10 flex gap-1 bg-ink p-2 md:static md:w-[88px] md:shrink-0 md:flex-col md:gap-2 md:px-2.5 md:py-4"
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
              active(it.href) ? 'bg-sun font-extrabold text-ink' : 'font-bold text-[#C9CDE0]'
            }`}
          >
            <Icon name={it.icon} size={24} />
            {it.label}
          </Link>
        ) : (
          <span
            key={it.href}
            title="Kommer snart"
            className="flex flex-1 flex-col items-center gap-1 rounded-[18px] py-2.5 text-[12px] font-bold text-[#6A7090] md:flex-none"
          >
            <Icon name={it.icon} size={24} />
            {it.label}
          </span>
        ),
      )}
      <div className="mt-auto hidden md:block">
        <FullscreenButton />
      </div>
    </nav>
  );
}
