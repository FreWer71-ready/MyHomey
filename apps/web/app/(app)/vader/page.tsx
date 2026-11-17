import { Fragment } from 'react';
import { Icon } from '@/components/Icon';
import { WeatherIcon } from '@/components/WeatherIcon';
import { loadWeather } from '@/lib/data';
import { hourLabel } from '@/lib/weather';
import { symbolInfo, weatherKind } from '@/lib/weather';
import { FREE_BG, FREE_CHIP, FREE_FG, dayInfo } from '@/lib/calendar-view';

export const dynamic = 'force-dynamic';

const num = (v: number, d = 1) => v.toLocaleString('sv-SE', { maximumFractionDigits: d });
const card = 'flex min-w-0 flex-col gap-3 rounded-[1.25rem] bg-card p-5 lg:p-6';
const h2 = 'flex items-center gap-2.5 text-[1.125rem] font-semibold text-dim';

/** Prognosen i detalj: 24 timmar och kommande dygn (flyttad från Hem). */
export default async function WeatherPage() {
  const w = await loadWeather();
  const now = Date.now();
  if (!w) return <p className={`${card} text-[1.0625rem] text-dim`}>Ingen väderprognos just nu.</p>;
  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-12 lg:items-start lg:gap-6">
      <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight lg:col-span-12">Väder{w.source ? ` · ${w.source}` : ''}</h1>
      <section aria-label="Kommande timmar" className={`${card} lg:col-span-7`}>
        <h2 className={h2}><Icon name="thermo" size={22} />24 timmar</h2>
        <ol className="grid grid-cols-4 gap-x-1 gap-y-2 sm:grid-cols-6 lg:grid-cols-8">
          {w.hours.slice(0, 24).map((x) => (
            // Varannan timme med svag ton (jämnt antal kolumner ger raka band); vid midnatt veckodagen.
            <li key={x.time} className="flex flex-col items-center rounded-[0.75rem] py-1.5 even:bg-white/[0.04]">
              <span className="text-[0.9375rem] text-dim tabular-nums">{hourLabel(x.time)}</span>
              <WeatherIcon kind={weatherKind(x.symbol)} size={34} label={symbolInfo(x.symbol).label} />
              <span className="text-[1.0625rem] font-semibold tabular-nums">{Number.isFinite(x.temp) ? `${Math.round(x.temp)}°` : '–'}</span>
              {x.precip >= 0.1 && <span className="text-[0.875rem] text-[#4FA3FF] tabular-nums">{num(x.precip)} mm</span>}
            </li>
          ))}
        </ol>
      </section>
      {w.days && w.days.length > 0 && (
        <section aria-label="Kommande dagar" className={`${card} lg:col-span-5`}>
          <h2 className={h2}><Icon name="calendar" size={22} />Kommande dagar</h2>
          {/* Samma dagformat som kalendern: dag i versaler + datum, helg och röda dagar i varm ton, avdelare vid ny vecka. */}
          <ol className="flex flex-col gap-1">
            {w.days.map((d, i) => {
              const info = dayInfo(d.date, now);
              const prev = i > 0 ? dayInfo(w.days![i - 1].date, now) : null;
              return (
                <Fragment key={d.date}>
                {prev && prev.week !== info.week && (
                  <li aria-hidden="true" className="flex items-center gap-2 pt-2 pb-1 text-[0.875rem] font-bold text-dim">
                    <span>v. {info.week}</span><span className="h-px grow bg-line" />
                  </li>
                )}
                <li className={`flex h-14 items-center gap-3 text-[1.0625rem] ${info.free ? '-mx-2.5 rounded-[0.875rem] px-2.5' : ''}`} style={info.free ? { background: FREE_BG } : undefined}>
                  <span className="flex w-32 shrink-0 flex-col leading-tight big:w-auto big:min-w-0 big:shrink">
                    <span className="text-[0.9375rem] font-bold" style={info.free ? { color: FREE_FG } : undefined}>{info.main}</span>
                    {info.holiday
                      ? <span className="w-fit rounded-full px-2 text-[0.875rem] font-bold" style={{ color: FREE_FG, background: FREE_CHIP }}>{info.holiday}</span>
                      : <span className="text-[0.875rem] text-dim">{info.sub}</span>}
                  </span>
                  <WeatherIcon kind={weatherKind(d.symbol)} size={34} label={symbolInfo(d.symbol).label} />
                  <span className="grow text-right text-[0.9375rem] text-dim big:max-sm:text-[0.8rem]">{d.precip >= 0.5 ? `${num(d.precip)} mm` : ''}</span>
                  <span className="font-semibold tabular-nums">{Math.round(d.max)}°</span>
                  <span className="w-10 text-right text-dim tabular-nums">{Math.round(d.min)}°</span>
                </li>
                </Fragment>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}
