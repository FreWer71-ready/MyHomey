'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { runFlow, runMood } from '@/app/actions/scene';

type State = { id: string; status: 'busy' | 'ok' | 'error'; msg?: string } | null;

type Item = { id: string; name: string; room?: string | null; advanced?: boolean };

/** Knappar som aktiverar Homey-moods eller startar flows (kind="flow"). */
export function MoodButtons({ moods, large = false, kind = 'mood' }: { moods: Item[]; large?: boolean; kind?: 'mood' | 'flow' }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [state, setState] = useState<State>(null);

  const run = (id: string) => {
    setState({ id, status: 'busy' });
    start(async () => {
      const item = moods.find((m) => m.id === id);
      const r = kind === 'flow' ? await runFlow(id, !!item?.advanced) : await runMood(id);
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
      <ul className={large ? 'grid grid-cols-2 gap-2.5 xl:grid-cols-3' : 'flex flex-wrap gap-2.5'}>
        {moods.map((m) => (
          <li key={m.id} className={large ? '' : 'shrink-0'}>
            <button
              type="button"
              onClick={() => run(m.id)}
              disabled={state?.status === 'busy'}
              className={`flex items-center gap-2.5 rounded-[20px] ${kind === 'flow' ? 'bg-teal-btn' : 'bg-violet-btn'} text-lg font-extrabold text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.18),0_2px_10px_rgb(0_0_0/0.3)] transition-shadow ${large ? 'min-h-16 w-full px-4 text-left' : 'min-h-14 px-5'} ${ring(m.id)}`}
            >
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
