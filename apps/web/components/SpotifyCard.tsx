'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BASE_PATH } from '@/lib/paths';
import { Icon } from './Icon';

type Device = { id: string; name: string; type: string; active: boolean; volume: number | null; volumeOk: boolean };
type State = {
  configured: boolean; connected: boolean; playing?: boolean;
  track?: { title: string; artist: string | null; image: string | null } | null;
  device?: { id: string; name: string; volume: number | null } | null;
  devices?: Device[]; error?: string;
};

/** Spotifys felorsaker i klartext. */
const REASON: Record<string, string> = {
  NO_ACTIVE_DEVICE: 'Ingen högtalare är aktiv. Välj en nedan.',
  PREMIUM_REQUIRED: 'Kräver Spotify Premium.',
  VOLUME_CONTROL_DISALLOW: 'Högtalaren tillåter inte volym härifrån.',
  UNKNOWN: 'Spotify kunde inte utföra det.',
};
const msg = (e?: string) => (e ? REASON[e] ?? e : null);

const Btn = ({ label, onClick, children, big = false }: { label: string; onClick: () => void; children: React.ReactNode; big?: boolean }) => (
  <button type="button" aria-label={label} onClick={onClick}
    className={`flex shrink-0 items-center justify-center rounded-full ${big ? 'size-14 bg-sun text-ink' : 'size-11 bg-white/[0.08]'} active:scale-95`}>
    {children}
  </button>
);

/**
 * Spotify (Connect): det som spelas, play/paus, föregående/nästa, volym och val av högtalare.
 * Läget hämtas när kortet visas och var 15:e sekund medan fliken är synlig. Döljs om Spotify-appen inte är inställd.
 */
export function SpotifyCard() {
  const [s, setS] = useState<State | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [vol, setVol] = useState<number | null>(null);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`${BASE_PATH}/api/spotify`, { cache: 'no-store' }).catch(() => null);
    const d: State | null = r ? await r.json().catch(() => null) : null;
    if (d) { setS(d); if (d.error) setErr(msg(d.error)); }
  }, []);
  useEffect(() => {
    load();
    const i = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 15_000);
    return () => clearInterval(i);
  }, [load]);
  useEffect(() => { setVol(s?.device?.volume ?? null); }, [s?.device?.id, s?.device?.volume]);

  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    setErr(null);
    if (action === 'play' || action === 'pause') setS((x) => (x ? { ...x, playing: action === 'play' } : x));
    const r = await fetch(`${BASE_PATH}/api/spotify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...extra }) }).catch(() => null);
    const d = r ? await r.json().catch(() => null) : null;
    if (!r?.ok) setErr(msg(d?.error) ?? 'Spotify svarar inte');
    setTimeout(load, 700);
  };
  const volume = (v: number) => {
    setVol(v);
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => act('volume', { pct: v }), 400);
  };

  if (!s || !s.configured) return null;
  if (!s.connected) {
    return (
      <a href={`${BASE_PATH}/api/spotify/login`} className="flex min-h-14 items-center justify-between gap-3 rounded-[1.25rem] bg-card px-5 text-[1.0625rem] font-semibold">
        Anslut Spotify för att styra musiken
        <span className="rounded-full bg-sun px-4 py-1.5 text-ink">Anslut</span>
      </a>
    );
  }
  const devices = s.devices ?? [];
  const active = devices.find((d) => d.active);
  return (
    <section aria-label="Spotify" className="flex flex-col gap-3 rounded-[1.25rem] bg-card p-4">
      <div className="flex min-w-0 items-center gap-3">
        {/* Omslaget är litet (64 px) och kommer från Spotifys CDN: ingen bildoptimering behövs. */}
        {s.track?.image
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={s.track.image} alt="" className="size-14 shrink-0 rounded-[0.75rem] object-cover" />
          : <span className="flex size-14 shrink-0 items-center justify-center rounded-[0.75rem] bg-white/[0.06]"><Icon name="music" size={26} /></span>}
        <span className="flex min-w-0 grow flex-col leading-tight">
          <span className="truncate text-[0.875rem] text-dim">Spotify{s.device ? ` · ${s.device.name}` : ''}</span>
          <span className="truncate text-[1.1875rem] font-bold">{s.track?.title ?? 'Inget spelas'}</span>
          {s.track?.artist && <span className="truncate text-[0.9375rem] text-dim">{s.track.artist}</span>}
        </span>
      </div>
      <div className="flex items-center justify-center gap-4">
        <Btn label="Föregående" onClick={() => act('previous')}><span aria-hidden className="text-[1.125rem]">⏮</span></Btn>
        <Btn big label={s.playing ? 'Pausa' : 'Spela'} onClick={() => act(s.playing ? 'pause' : 'play', !s.playing && !s.device && devices[0] ? { device: devices[0].id } : {})}>
          {s.playing ? <span aria-hidden className="text-[1.25rem] font-black">❚❚</span> : <Icon name="play" size={26} />}
        </Btn>
        <Btn label="Nästa" onClick={() => act('next')}><span aria-hidden className="text-[1.125rem]">⏭</span></Btn>
      </div>
      {vol != null && active?.volumeOk !== false && (
        <label className="flex items-center gap-3">
          <span className="w-14 shrink-0 text-[0.875rem] text-dim">Volym</span>
          <input type="range" min={0} max={100} value={vol} onChange={(e) => volume(Number(e.target.value))}
            aria-valuetext={`${vol} %`} className="h-11 min-w-0 grow accent-[var(--color-sun)]" />
          <span className="w-11 shrink-0 text-right text-[0.9375rem] font-semibold tabular-nums">{vol} %</span>
        </label>
      )}
      {devices.length > 0 ? (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Högtalare">
          {devices.map((d) => (
            <button key={d.id} type="button" aria-pressed={d.active} onClick={() => !d.active && act('transfer', { device: d.id })}
              className={`pill min-h-11 ${d.active ? 'on' : ''}`}>{d.name}</button>
          ))}
        </div>
      ) : (
        <p className="text-[0.875rem] text-dim">Inga högtalare syns just nu. Starta Spotify en gång på högtalaren, så dyker den upp här.</p>
      )}
      {err && <p role="status" className="text-[0.9375rem] font-semibold text-warn">{err}</p>}
    </section>
  );
}
