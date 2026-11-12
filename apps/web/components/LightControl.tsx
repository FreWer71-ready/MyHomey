'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { runLight, type LightCommand } from '@/app/actions/scene';
import type { Light } from '@/lib/home';
import { tint } from '@/lib/scale';
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
  const glow = !on ? undefined : light.can.color && light.hue != null && light.sat != null && light.sat > 0.3
    ? `linear-gradient(${hsl(light.hue, light.sat, 0.3)}, ${hsl(light.hue, light.sat, 0.3)}), var(--color-glass)` : tint('#FFC21A', 0.24);

  return (
    <li className="glass flex flex-col gap-2.5 rounded-3xl p-3" style={glow ? { background: glow } : undefined}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => { setOn(!on); send({ on: !on }); }}
          aria-pressed={on}
          aria-label={`${light.name} ${on ? 'släck' : 'tänd'}`}
          className={`flex size-14 shrink-0 items-center justify-center rounded-[18px] transition ${on ? 'bg-glass-hi' : 'bg-glass-2 opacity-45 grayscale'} ${status === 'busy' ? 'animate-pulse' : ''}`}
        >
          <Icon name="bulb" size={28} />
        </button>
        <span className="min-w-0 grow truncate text-[17px] font-extrabold">{light.name}</span>
        <span className="w-12 text-right text-sm font-extrabold">{on ? (light.can.dim ? `${dim} %` : 'På') : 'Av'}</span>
        {canColor && (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label="Färg och vit ton"
            className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-glass-hi"
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
          style={{ background: `linear-gradient(90deg, ${on ? 'var(--color-sun)' : 'rgba(255,255,255,0.32)'} ${dim}%, rgba(255,255,255,0.14) ${dim}%)` }}
          onChange={(e) => { const v = Number(e.target.value); setDim(v); setOn(true); later({ dim: v / 100 }); }}
        />
      )}

      {open && canColor && (
        <div className="flex flex-col gap-2.5 rounded-2xl bg-glass-2 p-2.5">
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
                    className="flex min-h-10 items-center gap-1.5 rounded-full bg-glass-hi px-3 text-sm font-extrabold">
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

      {status === 'error' && <p role="alert" className="rounded-xl glass px-3 py-1.5 text-sm font-extrabold text-danger">{error}</p>}
    </li>
  );
}
