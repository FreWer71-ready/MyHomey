import Link from 'next/link';
import type { Warnings } from '@/lib/data';
import { Icon } from './Icon';

const STYLE = {
  red: 'bg-danger-strong text-white',
  orange: 'bg-[#FF8A3D] text-[#1A1205]',
  yellow: 'bg-[#E8B400] text-[#1A1205]',
} as const;
const NAME = { red: 'Röd varning', orange: 'Orange varning', yellow: 'Gul varning' } as const;

/** "18:00" i dag, annars "fre 18:00" (Stockholm). */
export function when(ms: number | null): string {
  if (ms == null) return '';
  const tz = 'Europe/Stockholm';
  const day = (t: number) => new Intl.DateTimeFormat('sv-SE', { timeZone: tz, dateStyle: 'short' }).format(t);
  const time = new Intl.DateTimeFormat('sv-SE', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(ms);
  return day(ms) === day(Date.now()) ? time : `${new Intl.DateTimeFormat('sv-SE', { timeZone: tz, weekday: 'short' }).format(ms).replace('.', '')} ${time}`;
}

/** Varningar för startsidans varningsrad: VMA först, sedan SMHI (allvarligast), sedan oväder. Högst `max` st. */
export function warningBanners(w: Warnings, max = 3) {
  const items = [
    ...w.vma.map((v) => (
      <Link key={`vma-${v.id}`} href="/larm#vader" role="alert" className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[16px] bg-danger-strong px-3.5 py-1.5 text-white">
        <Icon name="bellAlert" size={22} />
        <span className="font-extrabold lg:truncate">VMA: {v.headline}</span>
      </Link>
    )),
    ...w.smhi.map((s) => (
      <Link key={`smhi-${s.id}`} href="/larm#vader" role="alert" className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-[16px] px-3.5 py-1.5 ${STYLE[s.level]}`}>
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-black/15 text-sm font-black">!</span>
        <span className="font-extrabold lg:truncate">
          {NAME[s.level]}: {s.event}{s.start && s.start > Date.now() ? ` från ${when(s.start)}` : ''}
        </span>
      </Link>
    )),
    ...w.storms.map((s) => (
      <Link key={`storm-${s.kind}`} href="/larm#vader" className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[16px] bg-info-strong px-3.5 py-1.5 text-white">
        <Icon name={s.kind === 'thunder' ? 'thunder' : s.kind === 'snow' ? 'snow' : 'rain'} size={22} />
        <span className="font-extrabold lg:truncate">{s.label} från {when(s.at)}</span>
      </Link>
    )),
  ];
  return items.slice(0, max);
}
