import { Icon } from './Icon';

export type TvView = {
  /** Var det syns: "Samsung TV" (app på The Frame) eller "Google TV". */
  source: string;
  app: string | null;
  title: string | null;
  subtitle: string | null;
  status: 'playing' | 'paused' | 'art' | 'off' | 'on' | 'unknown';
};

const STATUS: Record<TvView['status'], { text: string; color: string }> = {
  playing: { text: 'Spelar', color: '#3FB950' },
  paused: { text: 'Pausad', color: '#E3A008' },
  art: { text: 'Konstläge', color: '#8B98A5' },
  off: { text: 'Av', color: '#8B98A5' },
  on: { text: 'På', color: '#8B98A5' },
  unknown: { text: '–', color: '#8B98A5' },
};

/**
 * TV-rutan längst ner på Hem: källa och app, titel stort, läget till höger.
 * Lugn bakgrund när inget spelar; tonad TV-gradient när något spelas.
 */
export function TvBar({ v }: { v: TvView }) {
  const st = STATUS[v.status];
  const active = v.status === 'playing' || v.status === 'paused';
  return (
    <div className={`relative flex h-20 min-w-0 items-center gap-4 overflow-hidden rounded-[20px] px-5 ${active ? 'np-card np-tv border border-line' : 'bg-card'}`}>
      <span className="relative flex size-12 shrink-0 items-center justify-center rounded-[14px] bg-black/30">
        <Icon name={v.status === 'art' ? 'star' : 'tv'} size={28} />
      </span>
      <span className="relative flex min-w-0 grow flex-col leading-tight">
        <span className="truncate text-[15px] text-white/75">{[v.source, v.app].filter(Boolean).join(' · ')}</span>
        <span className={`truncate text-[24px] font-bold ${active ? 'text-white' : 'text-fg'}`}>
          {v.title ?? v.app ?? (v.status === 'art' ? 'Konstläge' : v.status === 'off' ? 'Avstängd' : 'Inget spelas')}
          {v.subtitle && <span className="text-[18px] font-semibold text-white/75"> · {v.subtitle}</span>}
        </span>
      </span>
      <span className="relative flex shrink-0 items-center gap-2 rounded-full bg-black/30 px-3 py-1.5 text-[16px] font-semibold" style={{ color: st.color }}>
        {v.status === 'playing' && <span className="eq flex h-4 items-end gap-[2px]" aria-hidden="true"><span /><span /><span /></span>}
        {st.text}
      </span>
    </div>
  );
}
