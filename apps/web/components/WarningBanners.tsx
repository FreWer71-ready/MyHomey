import type { Warnings } from '@/lib/data';
import type { Alert } from './AlertChips';

const NAME = { red: 'Röd varning', orange: 'Orange varning', yellow: 'Gul varning' } as const;

/** "18:00" i dag, annars "fre 18:00" (Stockholm). */
export function when(ms: number | null): string {
  if (ms == null) return '';
  const tz = 'Europe/Stockholm';
  const day = (t: number) => new Intl.DateTimeFormat('sv-SE', { timeZone: tz, dateStyle: 'short' }).format(t);
  const time = new Intl.DateTimeFormat('sv-SE', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(ms);
  return day(ms) === day(Date.now()) ? time : `${new Intl.DateTimeFormat('sv-SE', { timeZone: tz, weekday: 'short' }).format(ms).replace('.', '')} ${time}`;
}

/** Väderlarm som enhetliga varningar: VMA och röd SMHI = röd, orange = orange, gul SMHI och oväder = gul. */
export function weatherAlerts(w: Warnings): Alert[] {
  return [
    ...w.vma.map((v): Alert => ({ id: `vma-${v.id}`, level: 'red', icon: 'bellAlert', text: `VMA: ${v.headline}`, href: '/larm#vader' })),
    ...w.smhi.map((s): Alert => ({
      id: `smhi-${s.id}`, level: s.level, icon: '!', href: '/larm#vader',
      text: `${NAME[s.level]}: ${s.event}${s.start && s.start > Date.now() ? ` från ${when(s.start)}` : ''}`,
    })),
    ...w.storms.map((s): Alert => ({
      id: `storm-${s.kind}`, level: 'yellow', icon: s.kind === 'thunder' ? 'thunder' : s.kind === 'snow' ? 'snow' : 'rain',
      text: `${s.label} från ${when(s.at)}`, href: '/larm#vader',
    })),
  ];
}
