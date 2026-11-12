import type { NowPlaying } from '@/lib/media';
import { Icon } from './Icon';

/**
 * Det som spelas just nu: färgskiftande bakgrund (lila/rosa/orange för musik, blå/turkos för TV)
 * och en equalizer som rör sig. Visas bara när något faktiskt spelar.
 */
export function NowPlayingCard({ p }: { p: NowPlaying }) {
  const tv = p.kind === 'tv';
  return (
    <div className={`np-card ${tv ? 'np-tv' : 'np-music'} relative flex min-h-16 items-center gap-3 overflow-hidden rounded-[20px] border border-line px-3 py-2`}>
      <span className="relative flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-[rgb(10_13_24/0.55)]">
        <span className="np-pulse absolute inset-0 rounded-[14px]" />
        <Icon name={tv ? 'tv' : 'music'} size={24} />
      </span>
      <span className="relative flex min-w-0 grow flex-col">
        <span className="truncate text-[13px] font-bold text-white/85">{tv ? 'På TV:n' : 'Spelas nu'} · {p.device}</span>
        <span className="truncate text-[18px] leading-tight font-extrabold text-white">
          {p.title}{p.subtitle && <span className="font-bold text-white/80"> · {p.subtitle}</span>}
        </span>
      </span>
      <span className="eq relative mr-1 flex h-6 shrink-0 items-end gap-[3px]" aria-hidden="true">
        <span /><span /><span /><span />
      </span>
    </div>
  );
}
