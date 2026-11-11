'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { runScene } from '@/app/actions/scene';
import { Icon, type IconName } from './Icon';

const SCENES: { key: string; label: string; icon: IconName; className: string }[] = [
  { key: 'ljust', label: 'Ljust', icon: 'sun', className: 'bg-sun text-ink' },
  { key: 'mys', label: 'Mys', icon: 'moon', className: 'bg-white text-ink' },
  { key: 'slack', label: 'Släck', icon: 'power', className: 'bg-ink text-white' },
];

type State = { key: string; status: 'busy' | 'ok' | 'error'; msg?: string } | null;

/** Ljust / Mys / Släck för ett rum. Dashboarden hämtar nytt läge efter några sekunder. */
export function SceneButtons({ zoneId, room, size }: { zoneId: string; room: string; size: 'icon' | 'large' }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [state, setState] = useState<State>(null);

  const run = (key: string) => {
    setState({ key, status: 'busy' });
    start(async () => {
      const r = await runScene(zoneId, key);
      setState({ key, status: r.ok ? 'ok' : 'error', msg: r.error });
      if (r.ok) {
        // Homey kör scenen och därefter Dashboard-skriptet; hämta om när det hunnit in.
        setTimeout(() => router.refresh(), 4000);
        setTimeout(() => router.refresh(), 10000);
      }
      setTimeout(() => setState(null), r.ok ? 2500 : 6000);
    });
  };

  const ring = (key: string) => {
    if (state?.key !== key) return '';
    if (state.status === 'busy') return 'animate-pulse shadow-[0_0_0_3px_#12162B,0_0_0_5px_#FFFFFF]';
    if (state.status === 'ok') return 'shadow-[0_0_0_3px_#12B76A,0_0_0_5px_#FFFFFF]';
    return 'shadow-[0_0_0_3px_#F0503C,0_0_0_5px_#FFFFFF]';
  };

  return (
    <div className="flex flex-col gap-2">
      <div className={`grid grid-cols-3 ${size === 'large' ? 'gap-3.5' : 'gap-1.5'}`}>
        {SCENES.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => run(s.key)}
            disabled={state?.status === 'busy'}
            aria-label={`${s.label} i ${room}`}
            className={`flex items-center justify-center rounded-[14px] transition-shadow ${s.className} ${ring(s.key)} ${
              size === 'large' ? 'min-h-20 gap-3 rounded-[24px] text-[22px] font-extrabold' : 'min-h-11'
            }`}
          >
            <Icon name={s.icon} size={size === 'large' ? 40 : 24} />
            {size === 'large' && s.label}
          </button>
        ))}
      </div>
      {state?.status === 'error' && (
        <p role="alert" className="rounded-xl bg-white/80 px-3 py-1.5 text-sm font-extrabold text-[#B42318]">{state.msg}</p>
      )}
    </div>
  );
}
