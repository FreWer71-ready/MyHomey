'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { runMood } from '@/app/actions/scene';
import { Icon } from './Icon';

type State = { id: string; status: 'busy' | 'ok' | 'error'; msg?: string } | null;

/** Knappar som aktiverar Homey-moods. */
export function MoodButtons({ moods }: { moods: { id: string; name: string }[] }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [state, setState] = useState<State>(null);

  const run = (id: string) => {
    setState({ id, status: 'busy' });
    start(async () => {
      const r = await runMood(id);
      setState({ id, status: r.ok ? 'ok' : 'error', msg: r.error });
      if (r.ok) {
        setTimeout(() => router.refresh(), 4000);
        setTimeout(() => router.refresh(), 10000);
      }
      setTimeout(() => setState(null), r.ok ? 2500 : 6000);
    });
  };

  const ring = (id: string) =>
    state?.id !== id ? '' : state.status === 'busy' ? 'animate-pulse shadow-[0_0_0_3px_#12162B]'
      : state.status === 'ok' ? 'shadow-[0_0_0_3px_#12B76A]' : 'shadow-[0_0_0_3px_#F0503C]';

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-wrap gap-2.5">
        {moods.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => run(m.id)}
              disabled={state?.status === 'busy'}
              className={`flex min-h-14 items-center gap-2.5 rounded-[20px] bg-[#E3DAFF] px-5 text-lg font-extrabold text-ink transition-shadow ${ring(m.id)}`}
            >
              <Icon name="moon" size={24} />
              {m.name}
            </button>
          </li>
        ))}
      </ul>
      {state?.status === 'error' && (
        <p role="alert" className="rounded-xl bg-white px-3 py-1.5 text-sm font-extrabold text-[#B42318]">{state.msg}</p>
      )}
    </div>
  );
}
