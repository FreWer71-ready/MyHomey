'use client';
import { useEffect, useRef, useState } from 'react';
import { WeatherIcon } from './WeatherIcon';
import { skyState, solarElevation } from '@/lib/sky';
import { hourLabel, symbolInfo, weatherKind, type WeatherHour } from '@/lib/weather';

const num = (v: number, d = 1) => v.toLocaleString('sv-SE', { maximumFractionDigits: d });
const DIRS = ['norr', 'nordost', 'öst', 'sydost', 'syd', 'sydväst', 'väst', 'nordväst'];
const fromDir = (deg: number) => DIRS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
const dayTime = (ms: number) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', weekday: 'long', hour: '2-digit', minute: '2-digit' }).format(ms);

/** Säger åt bakgrunden (Backdrop) att visa en viss timmes väder och ljus; null = tillbaka till nu. */
function preview(h: WeatherHour | null, lat: number, lon: number) {
  window.dispatchEvent(new CustomEvent('wx-preview', { detail: h ? { sky: skyState(h), el: solarElevation(h.time, lat, lon) } : null }));
}

/**
 * Timprognos som rad att svepa i (som Yr): vald timme visas stort och bakgrunden animeras till den timmens väder.
 * `interactive=false` (Hem-kortet, som är en länk): bara svepbar rad, utan val.
 */
export function HourStrip({ hours, lat, lon, interactive = true }: { hours: WeatherHour[]; lat: number; lon: number; interactive?: boolean }) {
  const [sel, setSel] = useState(0);
  const row = useRef<HTMLOListElement>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!interactive) return;
    preview(sel === 0 ? null : hours[sel] ?? null, lat, lon);
  }, [sel, hours, lat, lon, interactive]);
  useEffect(() => () => { if (interactive) preview(null, lat, lon); }, [interactive, lat, lon]);

  // Svep: när raden stannat väljs timmen längst till vänster (snäpp-läget).
  const onScroll = () => {
    if (!interactive || !row.current) return;
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const el = row.current!;
      const first = el.firstElementChild as HTMLElement | null;
      const w = first ? first.getBoundingClientRect().width + 4 : 1;
      setSel(Math.min(hours.length - 1, Math.max(0, Math.round(el.scrollLeft / w))));
    }, 120);
  };
  const pick = (i: number) => {
    setSel(i);
    (row.current?.children[i] as HTMLElement | undefined)?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
  };

  const h = hours[sel];
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {interactive && h && (
        <div aria-live="polite" className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <span className="flex flex-col">
            <span className="text-[1rem] font-semibold text-dim first-letter:uppercase">{sel === 0 ? 'Nu' : dayTime(h.time)}</span>
            <span className="flex items-center gap-2">
              <span className="text-[3.5rem] leading-none font-extrabold tabular-nums">{Number.isFinite(h.temp) ? `${Math.round(h.temp)}°` : '–'}</span>
              <WeatherIcon kind={weatherKind(h.symbol)} size={56} label={symbolInfo(h.symbol).label} />
            </span>
            <span className="text-[1rem] font-semibold">{symbolInfo(h.symbol).label}</span>
          </span>
          <span className="flex flex-col items-end text-right text-[1rem]">
            {h.wind != null && <span><span className="font-semibold">{num(h.wind, 0)} m/s</span>{h.gust != null && h.gust > h.wind ? ` (byar ${num(h.gust, 0)})` : ''}{h.windFrom != null ? ` från ${fromDir(h.windFrom)}` : ''}</span>}
            <span className="text-dim">{h.precip >= 0.1 ? `${num(h.precip)} mm nederbörd` : 'Ingen nederbörd'}</span>
          </span>
        </div>
      )}
      <ol ref={row} onScroll={onScroll} aria-label="Kommande timmar"
        className="scroll-x -mx-1 flex snap-x snap-mandatory gap-1 overflow-x-auto px-1 pb-1">
        {hours.map((x, i) => {
          const body = (
            <>
              <span className="text-[0.9375rem] text-dim tabular-nums">{i === 0 && interactive ? 'Nu' : hourLabel(x.time)}</span>
              <WeatherIcon kind={weatherKind(x.symbol)} size={interactive ? 34 : 28} label={symbolInfo(x.symbol).label} />
              <span className="text-[1rem] font-semibold tabular-nums">{Number.isFinite(x.temp) ? `${Math.round(x.temp)}°` : '–'}</span>
              {interactive && <span className="h-4 text-[0.8125rem] text-[#4FA3FF] tabular-nums">{x.precip >= 0.1 ? `${num(x.precip)}` : ''}</span>}
            </>
          );
          const cls = `flex w-[3.75rem] shrink-0 snap-start flex-col items-center rounded-[0.75rem] py-1.5 ${i % 2 ? 'bg-white/[0.04]' : ''}`;
          return (
            <li key={x.time}>
              {interactive
                ? <button type="button" onClick={() => pick(i)} aria-pressed={sel === i} aria-label={`${i === 0 ? 'Nu' : dayTime(x.time)}: ${Math.round(x.temp)} grader, ${symbolInfo(x.symbol).label}`}
                    className={`${cls} ${sel === i ? '!bg-white/[0.14] ring-2 ring-sun/70' : ''}`}>{body}</button>
                : <span className={cls}>{body}</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
