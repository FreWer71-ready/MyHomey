'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { runFlow, runHueScene, runMood } from '@/app/actions/scene';
import { Icon, type IconName } from './Icon';

export type Action = {
  id: string; name: string; kind: 'mood' | 'flow' | 'hue';
  advanced?: boolean; dynamic?: boolean; active?: boolean; colors?: string[];
};

const KIND: Record<Action['kind'], string> = { mood: 'Mood', flow: 'Flow', hue: 'Hue-scen' };

/** Ikon efter namnet, så att knapparna går att skilja åt med en blick. */
export function iconFor(name: string): IconName {
  const n = name.toLowerCase();
  if (/natt|sov|godnatt|släck/.test(n)) return 'moon';
  if (/morgon|dag|ljust|vakna/.test(n)) return 'sun';
  if (/lämna|borta|går|semester/.test(n)) return 'door';
  if (/film|tv|bio|visning/.test(n)) return 'tv';
  if (/läs|lamp|ljus/.test(n)) return 'bulb';
  if (/fest|party|musik|dans/.test(n)) return 'music';
  if (/middag|mat|vin|jul/.test(n)) return 'wine';
  if (/kommer|hemma|välkommen|gäst/.test(n)) return 'home';
  if (/bil|tesla|ladd/.test(n)) return 'bolt';
  return 'star';
}

/**
 * Knappar för moods, flows och Hue-scener i samma stil: ikon (eller Hue-färger), namn och typ.
 * layout="grid" för Rutiner (rutor), "list" för rummens kort (rader). Status visas direkt på knappen.
 */
export function ActionTiles({ items, layout = 'list' }: { items: Action[]; layout?: 'grid' | 'list' }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [state, setState] = useState<{ id: string; status: 'busy' | 'ok' | 'error'; msg?: string } | null>(null);

  const run = (a: Action) => {
    setState({ id: a.id, status: 'busy' });
    start(async () => {
      const r = a.kind === 'flow' ? await runFlow(a.id, !!a.advanced) : a.kind === 'hue' ? await runHueScene(a.id, !!a.dynamic) : await runMood(a.id);
      setState({ id: a.id, status: r.ok ? 'ok' : 'error', msg: r.error });
      if (r.ok) setTimeout(() => router.refresh(), 4000);
      setTimeout(() => setState(null), r.ok ? 2500 : 6000);
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <ul className={layout === 'grid' ? 'grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4' : 'flex flex-col'}>
        {items.map((a) => {
          const st = state?.id === a.id ? state.status : null;
          return (
            <li key={`${a.kind}-${a.id}`} className={layout === 'list' ? 'border-b border-line last:border-b-0' : ''}>
              <button
                type="button" onClick={() => run(a)} disabled={state?.status === 'busy'}
                className={`relative flex w-full min-w-0 gap-3 text-left transition-colors ${
                  layout === 'grid'
                    ? 'min-h-[72px] flex-col items-start rounded-[16px] border border-line bg-white/[0.04] p-3 hover:bg-white/[0.08] sm:flex-row sm:items-center sm:px-4'
                    : 'min-h-14 items-center py-2'
                } ${st === 'busy' ? 'animate-pulse' : ''}`}
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-white/[0.06]">
                  {a.kind === 'hue' && a.colors?.length ? (
                    <span className="flex -space-x-1.5">
                      {a.colors.slice(0, 3).map((c, i) => <span key={i} className="size-3.5 rounded-full ring-2 ring-[#131A22]" style={{ background: c }} />)}
                    </span>
                  ) : <Icon name={iconFor(a.name)} size={24} />}
                </span>
                <span className="flex min-w-0 grow flex-col leading-tight">
                  <span className={`text-[17px] font-semibold ${layout === 'grid' ? 'line-clamp-2' : 'truncate'}`}>{a.name}</span>
                  <span className="truncate text-[15px] text-dim">
                    {KIND[a.kind]}{a.dynamic ? ' · dynamisk' : ''}{a.active ? ' · på' : ''}
                  </span>
                </span>
                {st && st !== 'busy' && (
                  <span className={`text-[20px] font-bold ${layout === 'grid' ? 'absolute top-2 right-3' : 'shrink-0'}`} aria-live="polite">
                    {st === 'ok' ? <span className="text-ok">✓</span> : <span className="text-danger">!</span>}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {state?.status === 'error' && <p role="alert" className="text-[16px] font-semibold text-danger">{state.msg ?? 'Det gick inte att starta.'}</p>}
    </div>
  );
}
