'use client';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { hueEffect, hueIdentify, hueRoom, hueSensor } from '@/app/actions/hue';
import type { Sensor } from '@/lib/home';

type Res = { ok: boolean; error?: string };
/** Kör en Hue-åtgärd, visar fel kort och hämtar om sidan när den lyckats. */
function useRun() {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: () => Promise<Res>, refresh = true) => start(async () => {
    const r = await fn();
    setErr(r.ok ? null : r.error ?? 'Försök igen');
    if (r.ok && refresh) router.refresh();
  });
  return { busy, err, run };
}
const chip = (on = false) => `pill min-h-11 px-3.5 text-[0.9375rem] ${on ? 'on' : ''}`;

/** Hela rummet: på/av och ljusstyrka (en order för alla lampor), samt släck mjukt om 15/30 min. */
export function RoomDimmer({ zone, room, on, level }: { zone: string; room: string; on: boolean; level: number }) {
  const { busy, err, run } = useRun();
  const [val, setVal] = useState(level);
  const [fading, setFading] = useState<number | null>(null);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const change = (v: number) => {
    setVal(v);
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => run(() => hueRoom(zone, { dim: v / 100 })), 350);
  };
  return (
    <div className={`flex flex-col gap-2 ${busy ? 'opacity-80' : ''}`}>
      <div className="flex items-center gap-3">
        <button type="button" role="switch" aria-checked={on} aria-label={`${room}: ${on ? 'släck' : 'tänd'} alla lampor`}
          onClick={() => run(() => hueRoom(zone, { on: !on }))}
          className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${on ? 'bg-sun' : 'bg-white/15'}`}>
          <span className={`absolute top-1 size-6 rounded-full bg-white shadow transition-[left] ${on ? 'left-7' : 'left-1'}`} />
        </button>
        <input type="range" min={1} max={100} value={val} onChange={(e) => change(Number(e.target.value))}
          aria-label={`Ljusstyrka ${room}`} aria-valuetext={`${val} %`}
          className="h-11 min-w-0 grow accent-[var(--color-sun)]" />
        <span className="w-11 shrink-0 text-right text-[0.9375rem] font-semibold tabular-nums">{val} %</span>
      </div>
      {on && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[0.875rem] text-dim">Släck mjukt</span>
          {[15, 30].map((m) => (
            <button key={m} type="button" aria-pressed={fading === m} onClick={() => { setFading(m); run(() => hueRoom(zone, { fade: m }), false); }}
              className={chip(fading === m)}>{m} min</button>
          ))}
          {fading && <span className="text-[0.875rem] text-dim">Tonar ned …</span>}
        </div>
      )}
      {err && <p role="alert" className="text-[0.875rem] text-danger">{err}</p>}
    </div>
  );
}

const EFFECTS = [['candle', 'Levande ljus'], ['fire', 'Eld'], ['sparkle', 'Glitter']] as const;

/** Per lampa: ljuseffekter (om lampan klarar dem) och Blinka, så man ser vilken lampa det är. */
export function LightExtras({ id, name, effects, effectOn }: { id: string; name: string; effects?: boolean; effectOn?: boolean }) {
  const { busy, err, run } = useRun();
  const [cur, setCur] = useState<string | null>(null);
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${busy ? 'opacity-80' : ''}`}>
      {effects && EFFECTS.map(([k, label]) => (
        <button key={k} type="button" aria-pressed={cur === k} onClick={() => { setCur(k); run(() => hueEffect(id, k)); }} className={chip(cur === k)}>{label}</button>
      ))}
      {effects && (effectOn || cur) && (
        <button type="button" onClick={() => { setCur(null); run(() => hueEffect(id, 'no_effect')); }} className={chip()}>Ingen effekt</button>
      )}
      <button type="button" onClick={() => run(() => hueIdentify(id), false)} aria-label={`Blinka ${name}`} className={chip()}>Blinka</button>
      {err && <span role="alert" className="text-[0.875rem] text-danger">{err}</span>}
    </div>
  );
}

const ago = (iso: string | null) => {
  if (!iso) return null;
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  return min < 1 ? 'nyss' : min < 60 ? `${min} min sedan` : min < 24 * 60 ? `${Math.round(min / 60)} h sedan` : `${Math.round(min / 1440)} d sedan`;
};

/** Rörelsesensor: rörelse, temperatur och ljus, och av/på (t.ex. när någon sover). */
export function SensorRow({ s }: { s: Sensor }) {
  const { busy, err, run } = useRun();
  return (
    <div className="flex min-h-11 items-center gap-3">
      <span className="flex min-w-0 grow flex-col leading-tight">
        <span className="truncate font-semibold">{s.name}</span>
        <span className="truncate text-[0.875rem] text-dim">
          {[s.enabled === false ? 'Avstängd' : s.motion ? 'Rörelse nu' : s.motionAt ? `Rörelse ${ago(s.motionAt)}` : null,
            s.temp != null ? `${s.temp.toLocaleString('sv-SE', { maximumFractionDigits: 1 })}°` : null,
            s.lux != null ? `${s.lux} lux` : null].filter(Boolean).join(' · ')}
        </span>
      </span>
      {s.enabled !== null && (
        <button type="button" role="switch" aria-checked={s.enabled} aria-label={`${s.name}: ${s.enabled ? 'stäng av' : 'slå på'} sensorn`} disabled={busy}
          onClick={() => run(() => hueSensor(s.id, !s.enabled))}
          className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${s.enabled ? 'bg-ok' : 'bg-white/15'}`}>
          <span className={`absolute top-1 size-6 rounded-full bg-white shadow transition-[left] ${s.enabled ? 'left-7' : 'left-1'}`} />
        </button>
      )}
      {err && <span role="alert" className="text-[0.875rem] text-danger">{err}</span>}
    </div>
  );
}
