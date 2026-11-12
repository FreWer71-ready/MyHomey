'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { runMood } from '@/app/actions/scene';
import { Icon } from './Icon';

type State = { id: string; status: 'busy' | 'ok' | 'error'; msg?: string } | null;

/** Knappar som aktiverar Homey-moods. */
export function MoodButtons({ moods, large = false }: { moods: { id: string; name: string; room?: string | null }[]; large?: boolean }) {
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
    state?.id !== id ? '' : state.status === 'busy' ? 'animate-pulse shadow-[0_0_0_3px_var(--color-fg)]'
      : state.status === 'ok' ? 'shadow-[0_0_0_3px_var(--color-ok)]' : 'shadow-[0_0_0_3px_var(--color-danger)]';

  return (
    <div className="flex flex-col gap-2">
      <ul className={large ? 'grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4' : 'flex flex-wrap gap-2.5'}>
        {moods.map((m) => (
          <li key={m.id} className={large ? '' : 'shrink-0'}>
            <button
              type="button"
              onClick={() => run(m.id)}
              disabled={state?.status === 'busy'}
              className={`flex items-center gap-2.5 rounded-[20px] bg-violet-soft text-lg font-extrabold text-fg transition-shadow ${large ? 'min-h-20 w-full px-4 text-left' : 'min-h-14 px-5'} ${ring(m.id)}`}
            >
              <Icon name="moon" size={24} />
              {m.room ? (
                <span className="flex flex-col items-start leading-tight">
                  {m.name}
                  <span className="text-[13px] font-bold text-fg/80">{m.room}</span>
                </span>
              ) : m.name}
            </button>
          </li>
        ))}
      </ul>
      {state?.status === 'error' && (
        <p role="alert" className="rounded-xl glass px-3 py-1.5 text-sm font-extrabold text-danger">{state.msg}</p>
      )}
    </div>
  );
}
