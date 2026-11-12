'use client';
import { useState, useTransition } from 'react';
import { runDevice } from '@/app/actions/scene';
import type { TvRemote as Remote } from '@/lib/media';
import { Icon, type IconName } from './Icon';

/**
 * Fjärrkontroll för TV:n: på/av (SmartThings), volym och ljud av (soundbaren om den finns i Homey,
 * annars TV:n som styr soundbaren via HDMI ARC) samt play/paus på Google TV. Visar det som spelas.
 */
export function TvRemote({ r, title }: { r: Remote; title?: string | null }) {
  const [on, setOn] = useState(r.tv?.on ?? false);
  const [vol, setVol] = useState(r.bar?.volume ?? null);
  const [muted, setMuted] = useState(r.bar?.muted ?? r.cast?.muted ?? false);
  const [playing, setPlaying] = useState(r.cast?.playing ?? false);
  const [flash, setFlash] = useState<{ key: string; ok: boolean } | null>(null);
  const [busy, start] = useTransition();

  const send = (key: string, id: string, cap: string, value: boolean | number, undo?: () => void) =>
    start(async () => {
      const res = await runDevice(id, cap, value);
      if (!res.ok) undo?.();
      setFlash({ key, ok: res.ok });
      setTimeout(() => setFlash(null), res.ok ? 900 : 4000);
    });

  const volume = (dir: 1 | -1) => {
    if (r.bar && vol != null) {
      const next = Math.min(1, Math.max(0, Math.round((vol + dir * 0.05) * 100) / 100));
      setVol(next);
      send(dir > 0 ? 'up' : 'down', r.bar.id, 'volume_set', next, () => setVol(vol));
    } else if (r.tv) {
      send(dir > 0 ? 'up' : 'down', r.tv.id, dir > 0 ? 'volume_up' : 'volume_down', true);
    }
  };
  const muteTarget = r.bar ?? r.cast;

  const Btn = ({ k, icon, label, onClick, active }: { k: string; icon: IconName; label: string; onClick: () => void; active?: boolean }) => (
    <button
      type="button" aria-label={label} title={label} onClick={onClick} disabled={busy}
      className={`flex size-11 shrink-0 items-center justify-center rounded-[14px] transition-shadow ${active ? 'bg-white text-ink' : 'bg-[rgb(10_13_24/0.55)] text-white'} ${
        flash?.key === k ? (flash.ok ? 'shadow-[0_0_0_3px_var(--color-ok)]' : 'shadow-[0_0_0_3px_var(--color-danger)]') : ''}`}
    >
      <Icon name={icon} size={22} />
    </button>
  );

  return (
    <div className={`np-card np-tv relative flex min-h-16 items-center gap-2 overflow-hidden rounded-[20px] border border-line px-2.5 py-2 ${on ? '' : 'opacity-90 saturate-50'}`}>
      <span className="relative flex min-w-0 grow flex-col pl-1">
        <span className="truncate text-[13px] font-bold text-white/85">TV · {r.tv?.name}{vol != null ? ` · volym ${Math.round(vol * 100)}` : ''}</span>
        <span className="truncate text-[17px] leading-tight font-extrabold text-white">{on ? title || 'På' : 'Av'}</span>
      </span>
      {r.tv && (
        <Btn k="power" icon="powerLine" label={on ? 'Stäng av TV:n' : 'Slå på TV:n'} active={on}
          onClick={() => { setOn(!on); send('power', r.tv!.id, 'onoff', !on, () => setOn(on)); }} />
      )}
      {on && (
        <>
          <Btn k="down" icon="volDown" label="Sänk volymen" onClick={() => volume(-1)} />
          {muteTarget && (
            <Btn k="mute" icon="mute" label={muted ? 'Slå på ljudet' : 'Stäng av ljudet'} active={muted}
              onClick={() => { setMuted(!muted); send('mute', muteTarget.id, 'volume_mute', !muted, () => setMuted(muted)); }} />
          )}
          <Btn k="up" icon="volUp" label="Höj volymen" onClick={() => volume(1)} />
          {r.cast && (
            <Btn k="play" icon="playPause" label={playing ? 'Pausa' : 'Spela'} active={playing}
              onClick={() => { setPlaying(!playing); send('play', r.cast!.id, 'speaker_playing', !playing, () => setPlaying(playing)); }} />
          )}
        </>
      )}
    </div>
  );
}
