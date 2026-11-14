import { Icon } from '@/components/Icon';
import { WeatherIcon } from '@/components/WeatherIcon';
import { loadWeather } from '@/lib/data';
import { hhmm } from '@/lib/prices';
import { symbolInfo, weatherKind } from '@/lib/weather';

export const dynamic = 'force-dynamic';

const num = (v: number, d = 1) => v.toLocaleString('sv-SE', { maximumFractionDigits: d });
const card = 'flex min-w-0 flex-col gap-3 rounded-[20px] bg-card p-5 lg:p-6';
const h2 = 'flex items-center gap-2.5 text-[18px] font-semibold text-dim';

/** Prognosen i detalj: 24 timmar och kommande dygn (flyttad från Hem). */
export default async function WeatherPage() {
  const w = await loadWeather();
  if (!w) return <p className={`${card} text-[17px] text-dim`}>Ingen väderprognos just nu.</p>;
  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-12 lg:items-start lg:gap-6">
      <h1 className="text-[28px] leading-tight font-bold tracking-tight lg:col-span-12">Väder{w.source ? ` · ${w.source}` : ''}</h1>
      <section aria-label="Kommande timmar" className={`${card} lg:col-span-7`}>
        <h2 className={h2}><Icon name="thermo" size={22} />24 timmar</h2>
        <ol className="grid grid-cols-4 gap-y-3 sm:grid-cols-6 lg:grid-cols-8">
          {w.hours.slice(0, 24).map((x) => (
            <li key={x.time} className="flex flex-col items-center">
              <span className="text-[15px] text-dim tabular-nums">{hhmm(x.time).slice(0, 2)}</span>
              <WeatherIcon kind={weatherKind(x.symbol)} size={34} label={symbolInfo(x.symbol).label} />
              <span className="text-[17px] font-semibold tabular-nums">{Number.isFinite(x.temp) ? `${Math.round(x.temp)}°` : '–'}</span>
              {x.precip >= 0.1 && <span className="text-[13px] text-[#4FA3FF] tabular-nums">{num(x.precip)} mm</span>}
            </li>
          ))}
        </ol>
      </section>
      {w.days && w.days.length > 0 && (
        <section aria-label="Kommande dagar" className={`${card} lg:col-span-5`}>
          <h2 className={h2}><Icon name="calendar" size={22} />Kommande dagar</h2>
          <ol className="flex flex-col">
            {w.days.map((d) => {
              const day = new Intl.DateTimeFormat('sv-SE', { weekday: 'long', timeZone: 'Europe/Stockholm' }).format(Date.parse(`${d.date}T12:00:00Z`));
              return (
                <li key={d.date} className="flex h-14 items-center gap-3 border-b border-line text-[17px] last:border-b-0">
                  <span className="w-24 capitalize">{day}</span>
                  <WeatherIcon kind={weatherKind(d.symbol)} size={34} label={symbolInfo(d.symbol).label} />
                  <span className="grow text-[15px] text-dim">{d.precip >= 0.5 ? `${num(d.precip)} mm` : ''}</span>
                  <span className="font-semibold tabular-nums">{Math.round(d.max)}°</span>
                  <span className="w-10 text-right text-dim tabular-nums">{Math.round(d.min)}°</span>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}
