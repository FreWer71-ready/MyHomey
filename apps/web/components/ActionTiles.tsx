'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { runFlow, runHueScene, runMood, runScenes } from '@/app/actions/scene';
import { Icon, type IconName } from './Icon';

export type Action = {
  id: string; name: string; kind: 'mood' | 'flow' | 'hue' | 'room';
  /** kind 'room': Ljust/Mys/Släck i de här rummen. */
  zones?: string[]; scene?: string;
  advanced?: boolean; dynamic?: boolean; active?: boolean; colors?: string[];
  /** Av/på-knapp (t.ex. Auto On/Off): `active` = läget (Homey-variabel). Fylld när på, tom när av. */
  toggle?: boolean;
};

const KIND: Record<Action['kind'], string> = { mood: 'Mood', flow: 'Flow', hue: 'Hue-scen', room: 'Rum' };

/** Ikon efter namnet, så att knapparna går att skilja åt med en blick. */
export function iconFor(name: string): IconName {
  const n = name.toLowerCase();
  if (/bajen|hammarby/.test(n)) return 'bajen';
  if (/sverige|svensk/.test(n)) return 'sweden';
  if (/villa/.test(n)) return 'villa';
  if (/visningsläge|husförsäljning/.test(n)) return 'forsale';
  if (/override/.test(n)) return /\b(off|av)\b/.test(n) ? 'toggleOff' : 'toggle';
  if (/städ/.test(n)) return 'clean';
  if (/chill/.test(n)) return 'evening';
  if (/\bkväll\b/.test(n)) return 'tvsofa';
  if (/natt|sov|godnatt|släck/.test(n)) return 'moon';
  if (/mys/.test(n)) return 'sofa';
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
export function ActionTiles({ items, layout = 'list', cols = 1 }: { items: Action[]; layout?: 'grid' | 'list' | 'compact'; cols?: 1 | 2 }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [state, setState] = useState<{ id: string; status: 'busy' | 'ok' | 'error'; msg?: string } | null>(null);
  // Av/på-knappar byter läge direkt vid tryck; Homey skickar det riktiga värdet inom någon minut.
  const [flip, setFlip] = useState<Record<string, boolean>>({});
  const on = (a: Action) => flip[a.id] ?? !!a.active;

  const run = (a: Action) => {
    setState({ id: a.id, status: 'busy' });
    start(async () => {
      const r = a.kind === 'flow' ? await runFlow(a.id, !!a.advanced) : a.kind === 'hue' ? await runHueScene(a.id, !!a.dynamic)
        : a.kind === 'room' ? await runScenes(a.zones ?? [], a.scene ?? '') : await runMood(a.id);
      setState({ id: a.id, status: r.ok ? 'ok' : 'error', msg: r.error });
      if (r.ok && a.toggle) {
        setFlip((f) => ({ ...f, [a.id]: !on(a) }));
        setTimeout(() => setFlip((f) => { const n = { ...f }; delete n[a.id]; return n; }), 90_000);
      }
      if (r.ok) setTimeout(() => router.refresh(), 4000);
      setTimeout(() => setState(null), r.ok ? 2500 : 6000);
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <ul className={layout === 'grid' ? 'grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4' : layout === 'compact' ? 'grid grid-cols-2 gap-2' : cols === 2 ? 'grid grid-cols-1 gap-x-8 md:grid-cols-2' : 'flex flex-col'}>
        {items.map((a) => {
          const st = state?.id === a.id ? state.status : null;
          return (
            <li key={`${a.kind}-${a.id}`} className={layout === 'list' ? `border-b border-line last:border-b-0 ${cols === 2 ? 'md:[&:nth-last-child(2):nth-child(odd)]:border-b-0' : ''}` : ''}>
              <button
                type="button" onClick={() => run(a)} disabled={state?.status === 'busy'} aria-pressed={a.toggle ? on(a) : undefined}
                className={`relative flex w-full min-w-0 text-left ${layout === 'compact' ? 'gap-2' : 'gap-3'} transition-colors ${
 layout === 'grid'
 ? 'h-[6.75rem] flex-col items-start justify-center overflow-hidden rounded-[1rem] border border-line bg-white/[0.04] p-3 hover:bg-white/[0.08] sm:h-[4.75rem] sm:flex-row sm:items-center sm:px-4'
 : layout === 'compact'
 ? 'h-full min-h-12 items-center rounded-[0.875rem] border border-line bg-white/[0.04] px-2.5 py-2 hover:bg-white/[0.08]'
 : 'h-14 items-center'
 } ${a.toggle ? (on(a) ? '!border-[#E6EDF3] !bg-[#E6EDF3] !text-[#0B0F14]' : '!bg-transparent') : ''} ${st === 'busy' ? 'animate-pulse' : ''}`}
              >
                <span className={`flex shrink-0 items-center justify-center ${layout === 'compact' ? `h-5 min-w-5 ${a.toggle && on(a) ? '' : 'text-dim'}` : 'size-10 rounded-[0.75rem] bg-white/[0.06]'}`}>
                  {a.kind === 'hue' && a.colors?.length ? (
                    <span className="flex -space-x-1.5">
                      {a.colors.slice(0, 3).map((c, i) => <span key={i} className="size-3.5 rounded-full ring-2 ring-[#131A22]" style={{ background: c }} />)}
                    </span>
                  ) : <Icon name={a.toggle ? (on(a) ? 'toggle' : 'toggleOff') : iconFor(a.name)} size={layout === 'compact' ? 20 : 24} />}
                </span>
                <span className="flex min-w-0 grow flex-col leading-tight">
                  <span className={`font-semibold ${layout === 'grid' ? 'text-[1.0625rem] line-clamp-1 sm:line-clamp-2' : layout === 'compact' ? 'text-[0.9375rem] break-words hyphens-auto' : 'text-[1.0625rem] truncate'}`}>{a.name}</span>
                  <span className={`truncate text-[0.9375rem] text-dim ${layout === 'compact' ? 'hidden' : ''}`}>
                    {KIND[a.kind]}{a.dynamic ? ' · dynamisk' : ''}{a.active ? ' · på' : ''}
                  </span>
                </span>
                {st && st !== 'busy' && (
                  <span className={`text-[1.25rem] font-bold ${layout === 'grid' ? 'absolute top-2 right-3' : 'shrink-0'}`} aria-live="polite">
                    {st === 'ok' ? <span className="text-ok">✓</span> : <span className="text-danger">!</span>}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {state?.status === 'error' && <p role="alert" className="text-[1rem] font-semibold text-danger">{state.msg ?? 'Det gick inte att starta.'}</p>}
    </div>
  );
}
