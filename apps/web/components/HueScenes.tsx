'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { runHueScene } from '@/app/actions/scene';
import type { HueScene } from '@/lib/data';

type State = { id: string; status: 'busy' | 'ok' | 'error'; msg?: string } | null;

/** Hue-scener som knappar med scenens färger. Dynamiska scener kan även startas med rörelse. */
export function HueScenes({ scenes }: { scenes: HueScene[] }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [state, setState] = useState<State>(null);

  const run = (id: string, dynamic: boolean) => {
    setState({ id, status: 'busy' });
    start(async () => {
      const r = await runHueScene(id, dynamic);
      setState({ id, status: r.ok ? 'ok' : 'error', msg: r.error });
      if (r.ok) setTimeout(() => router.refresh(), 4000);
      setTimeout(() => setState(null), r.ok ? 2500 : 6000);
    });
  };
  const ring = (id: string) =>
    state?.id !== id ? '' : state.status === 'busy' ? 'animate-pulse shadow-[0_0_0_3px_var(--color-fg)]'
      : state.status === 'ok' ? 'shadow-[0_0_0_3px_var(--color-ok)]' : 'shadow-[0_0_0_3px_var(--color-danger)]';

  return (
    <div className="flex flex-col gap-2">
      <ul className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-4">
        {scenes.map((s) => {
          const bg = s.colors.length > 1 ? `linear-gradient(120deg, ${s.colors.join(', ')})` : (s.colors[0] ?? '#FFE9C7');
          return (
            <li key={s.id} className={`flex overflow-hidden rounded-[20px] border border-line bg-card transition-shadow ${ring(s.id)}`}>
              <button type="button" onClick={() => run(s.id, false)} disabled={state?.status === 'busy'} className="flex min-h-16 min-w-0 grow items-center gap-3 px-3 text-left">
                <span className="size-9 shrink-0 rounded-full shadow-[inset_0_0_0_2px_rgb(255_255_255/0.3)]" style={{ background: bg }} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[17px] font-extrabold">{s.name}</span>
                  {s.active && <span className="text-[13px] font-bold text-ok">På nu</span>}
                </span>
              </button>
              {s.dynamic && (
                <button
                  type="button" onClick={() => run(s.id, true)} disabled={state?.status === 'busy'}
                  aria-label={`${s.name} med rörelse`} title="Starta med rörelse (dynamisk)"
                  className="flex w-12 shrink-0 items-center justify-center border-l border-line text-xl font-extrabold text-sun"
                >
                  ∿
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {state?.status === 'error' && <p role="alert" className="rounded-xl glass px-3 py-1.5 text-sm font-extrabold text-danger">{state.msg}</p>}
    </div>
  );
}
