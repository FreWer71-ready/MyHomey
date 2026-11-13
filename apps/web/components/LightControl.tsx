'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { runLight, type LightCommand } from '@/app/actions/scene';
import type { Light } from '@/lib/home';
import { Icon } from './Icon';

/** Färdiga vita toner (light_temperature: 0 kallt … 1 varmt) och färger (hue/sat 0–1). */
const WHITES = [
  { label: 'Kallvit', temp: 0.05, css: '#D6E6FF' },
  { label: 'Neutral', temp: 0.45, css: '#FFF4E0' },
  { label: 'Varmvit', temp: 0.8, css: '#FFD9A0' },
  { label: 'Mysvarm', temp: 1, css: '#FFB45A' },
];
const COLORS = [
  { label: 'Orange', hue: 0.07, sat: 0.9 }, { label: 'Röd', hue: 0, sat: 0.95 }, { label: 'Rosa', hue: 0.92, sat: 0.6 },
  { label: 'Lila', hue: 0.78, sat: 0.7 }, { label: 'Blå', hue: 0.62, sat: 0.85 }, { label: 'Turkos', hue: 0.5, sat: 0.7 },
  { label: 'Grön', hue: 0.33, sat: 0.75 }, { label: 'Gul', hue: 0.14, sat: 0.8 },
];
const hsl = (hue: number, sat: number, a = 1) => `hsl(${Math.round(hue * 360)} ${Math.round(sat * 100)}% 58% / ${a})`;

/** Lampkort med av/på, ljusstyrka och (om lampan klarar det) vit ton och färg. */
export function LightControl({ light }: { light: Light }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [on, setOn] = useState(light.on);
  const [dim, setDim] = useState(light.dim ?? 100);
  const [temp, setTemp] = useState(light.temp ?? 0.8);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<'idle' | 'busy' | 'error'>('idle');
  const [error, setError] = useState<string>();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Nya värden från Homey (efter uppdatering) tar över när inget skickas.
  useEffect(() => {
    if (status !== 'idle') return;
    setOn(light.on);
    if (light.dim != null) setDim(light.dim);
    if (light.temp != null) setTemp(light.temp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [light.on, light.dim, light.temp]);

  const send = (c: LightCommand) => {
    setStatus('busy');
    start(async () => {
      const r = await runLight(light.id, c);
      setStatus(r.ok ? 'idle' : 'error');
      setError(r.error);
      if (r.ok) {
        setTimeout(() => router.refresh(), 3500);
        setTimeout(() => router.refresh(), 9000);
      }
    });
  };
  /** Reglage skickar först när man slutat dra en stund. */
  const later = (c: LightCommand) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => send(c), 450);
  };

  const canColor = light.can.temp || light.can.color;
  // Lampans färg (eller varmt gult) syns bara i ikonen och reglaget; kortet är mörkt som resten av appen.
  const lamp = light.can.color && light.hue != null && light.sat != null && light.sat > 0.3 ? hsl(light.hue, light.sat) : '#F5B544';

  return (
    <li className="flex flex-col gap-3 rounded-[20px] bg-card p-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => { setOn(!on); send({ on: !on }); }}
          aria-pressed={on}
          aria-label={`${light.name} ${on ? 'släck' : 'tänd'}`}
          className={`flex size-12 shrink-0 items-center justify-center rounded-[14px] transition ${on ? '' : 'bg-white/[0.06] opacity-45 grayscale'} ${status === 'busy' ? 'animate-pulse' : ''}`}
          style={on ? { background: `color-mix(in srgb, ${lamp} 28%, transparent)`, boxShadow: `0 0 18px color-mix(in srgb, ${lamp} 35%, transparent)` } : undefined}
        >
          <Icon name="bulb" size={28} />
        </button>
        <span className="flex min-w-0 grow flex-col leading-tight">
          <span className="truncate text-[17px] font-semibold">{light.name}</span>
          <span className="text-[15px] text-dim">{on ? 'Tänd' : 'Släckt'}</span>
        </span>
        <span className="flex w-14 shrink-0 flex-col items-end leading-none">
          <span className="text-[24px] font-bold tabular-nums">{on ? (light.can.dim ? dim : 'På') : 'Av'}</span>
          {on && light.can.dim && <span className="mt-1 text-[13px] text-dim">%</span>}
        </span>
        {canColor && (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label="Färg och vit ton"
            className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-white/[0.06]"
          >
            <span className="size-6 rounded-full" style={{ background: 'conic-gradient(#FF5A5A, #FFC21A, #5AD07A, #4FA3FF, #B07AFF, #FF5A5A)' }} />
          </button>
        )}
      </div>

      {light.can.dim && (
        <input
          type="range" min={1} max={100} value={dim}
          aria-label={`Ljusstyrka ${light.name}`}
          className="slider"
          style={{ background: `linear-gradient(90deg, ${on ? lamp : 'rgba(255,255,255,0.32)'} ${dim}%, rgba(255,255,255,0.12) ${dim}%)` }}
          onChange={(e) => { const v = Number(e.target.value); setDim(v); setOn(true); later({ dim: v / 100 }); }}
        />
      )}

      {open && canColor && (
        <div className="flex flex-col gap-2.5 rounded-[14px] bg-white/[0.04] p-3">
          {light.can.temp && (
            <>
              <input
                type="range" min={0} max={100} value={Math.round(temp * 100)}
                aria-label={`Vit ton ${light.name}, kall till varm`}
                className="slider"
                style={{ background: 'linear-gradient(90deg, #D6E6FF, #FFF4E0, #FFB45A)' }}
                onChange={(e) => { const v = Number(e.target.value) / 100; setTemp(v); setOn(true); later({ temp: v }); }}
              />
              <div className="flex flex-wrap gap-1.5">
                {WHITES.map((w) => (
                  <button key={w.label} type="button" onClick={() => { setTemp(w.temp); setOn(true); send({ temp: w.temp }); }}
                    className="flex min-h-10 items-center gap-1.5 rounded-full bg-white/[0.08] px-3 text-[15px] font-semibold">
                    <span className="size-4 rounded-full" style={{ background: w.css }} />{w.label}
                  </button>
                ))}
              </div>
            </>
          )}
          {light.can.color && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Färger">
              {COLORS.map((c) => (
                <button key={c.label} type="button" onClick={() => { setOn(true); send({ hue: c.hue, sat: c.sat }); }}
                  aria-label={c.label} title={c.label}
                  className="size-10 rounded-full shadow-[inset_0_0_0_2px_rgba(255,255,255,0.35)]"
                  style={{ background: hsl(c.hue, c.sat) }} />
              ))}
            </div>
          )}
        </div>
      )}

      {status === 'error' && <p role="alert" className="text-[15px] font-semibold text-danger">{error}</p>}
    </li>
  );
}
