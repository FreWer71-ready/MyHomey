import Link from 'next/link';
import { TrendArrow } from '@/components/TrendArrow';
import { Clock } from '@/components/Clock';
import { Icon, type IconName } from '@/components/Icon';
import { RoomTile } from '@/components/RoomTile';
import { humidityWarnings, rainWarning } from '@/lib/alerts';
import { loadHome, loadNameDay, loadNet, loadNowPlaying, loadOpeningsToday, loadPrices, loadWeather } from '@/lib/data';
import { joinNames } from '@/lib/days';
import { seenAgo } from '@/lib/time';
import { NET_LABEL } from '@/lib/net';
import { symbolInfo, weatherKind } from '@/lib/weather';
import { WeatherIcon } from '@/components/WeatherIcon';
import { PRICE_AREA, hhmm, summarize } from '@/lib/prices';
import { fmtTemp, fmtWatt, heatTint, tint } from '@/lib/scale';

export const dynamic = 'force-dynamic';

const fmtNum = (v: number) => v.toLocaleString('sv-SE', { maximumFractionDigits: 1 });

function Hero({ bg, icon, label, href, popover, wide, children }: {
  bg: string; icon: IconName; label: string; href?: string; popover?: string; wide?: boolean; children: React.ReactNode;
}) {
  // Länk, knapp som öppnar en popup (native popover) eller vanlig ruta.
  const Box = href ? Link : popover ? 'button' : 'div';
  const extra = popover ? { type: 'button' as const, popoverTarget: popover, 'aria-label': `${label}, visa prognos` } : {};
  return (
    <Box href={href!} {...extra} className={`text-left glass relative flex flex-col gap-0.5 overflow-hidden rounded-[22px] px-3.5 py-3 lg:min-w-0 ${wide ? 'col-span-2 lg:flex-[1.55]' : 'lg:flex-1'}`} style={{ background: bg }}>
      <span className="relative flex items-center gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-glass-hi">
          <Icon name={icon} size={20} />
        </span>
        <span className="text-[15px] font-bold">{label}</span>
      </span>
      {children}
    </Box>
  );
}

export default async function HomePage() {
  const [h, prices, weather, openedToday, nameDay, playing, net] = await Promise.all([
    loadHome(), loadPrices(), loadWeather(), loadOpeningsToday(), loadNameDay(), loadNowPlaying(), loadNet(),
  ]);
  const names = joinNames(nameDay);
  const entrance = h.openings.find((o) => o.kind === 'door' && /entr|ytterdörr|front/i.test(o.name));
  const price = summarize(prices, Date.now());
  const open = h.openings.filter((o) => o.open);
  const sky = weather ? symbolInfo(weather.current.symbol) : null;
  const warning = rainWarning(weather, h.openings);
  const damp = humidityWarnings(h.rooms);

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 lg:flex-nowrap">
        <div className="shrink-0">
          <p className="text-[13px] font-bold tracking-wider text-fg uppercase">
            <Clock show="date" />
            {names && (
              <span className="text-dim">
                {' · namnsdag '}
                <span className="text-sun">{names}</span>
              </span>
            )}
          </p>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-[32px] leading-tight font-extrabold tracking-tight">Hemma</h1>
            {/* Närvaro (Smart Presence i Homey): grönt = hemma, rött = borta med när personen sågs senast. */}
            {h.people.length > 0 && (
              <span className="flex flex-wrap items-center gap-1.5">
                {[...h.people].sort((x, y) => Number(y.present) - Number(x.present)).map((p) => (
                  <span
                    key={p.id}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[15px] font-extrabold ${p.present ? 'bg-ok-soft text-ok' : 'bg-danger-strong text-white'}`}
                    title={p.present ? `${p.name} är hemma` : `${p.name} är borta`}
                  >
                    <span className={`size-2 rounded-full ${p.present ? 'bg-ok' : 'bg-white'}`} />
                    {p.name}
                    {!p.present && p.since && <span className="font-bold opacity-90">· {seenAgo(p.since)}</span>}
                  </span>
                ))}
              </span>
            )}
          </div>
        </div>
        {/* Varningar: i rubrikraden på plattan (sparar höjd), egen rad på mobil. */}
        {(warning || damp.length > 0 || net?.state === 'down') && (
          <div className="order-last flex w-full min-w-0 flex-col gap-1.5 lg:order-none lg:w-auto lg:grow">
            {net?.state === 'down' && (
              <Link href="/larm#natverk" role="alert" className="flex items-center gap-2.5 rounded-[16px] bg-danger-strong px-3.5 py-2 text-white">
                <Icon name="wifi" size={22} />
                <span className="truncate font-extrabold">Internet nere{net.isp ? ` · ${net.isp}` : ''} – kolla routern</span>
              </Link>
            )}
            {warning && (
              <Link href="/larm" role="alert" className="flex items-center gap-2.5 rounded-[16px] bg-info-strong px-3.5 py-2 text-white">
                <Icon name="rain" size={22} />
                <span className="truncate font-extrabold">
                  Nederbörd kl {hhmm(warning.at)} – stäng {warning.windows.map((w) => w.name).join(', ')}
                </span>
              </Link>
            )}
            {damp.length > 0 && (
              <Link href="/larm#fukt" role="alert" className="flex items-center gap-2.5 rounded-[16px] bg-teal px-3.5 py-2 text-white">
                <Icon name="drop" size={22} />
                <span className="truncate font-extrabold">
                  Fukt {damp.map((r) => `${r.name} ${Math.round(r.humidity!)} %`).join(', ')} – vädra eller kör fläkten
                </span>
              </Link>
            )}
          </div>
        )}
        <div className="flex shrink-0 items-center gap-4">
          {net && net.state !== 'down' && (
            <Link
              href="/larm#natverk"
              className={`hidden items-center gap-2 rounded-full px-3 py-1.5 text-[14px] font-bold lg:flex ${net.state === 'ok' ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn'}`}
            >
              <Icon name="wifi" size={18} />
              {net.state === 'ok' ? `${net.isp ?? 'Internet'} · ${net.latency == null ? '–' : Math.round(net.latency)} ms` : NET_LABEL[net.state]}
            </Link>
          )}
          <Clock show="time" className="text-3xl leading-none font-extrabold tracking-tight md:text-4xl" />
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:flex">
        {(h.outdoorTemp != null || h.outdoorStale || weather) && (
        <Hero wide popover={weather ? 'prognos' : undefined} bg={heatTint(h.outdoorTemp)} icon="thermo" label={`Ute${weather?.source ? ` · ${weather.source}` : ''}`}>
          {/* Stor vädersymbol, ca 1/4 av kortet, lätt genomskinlig mot tonen. */}
          {sky && weather && (
            <span className="pointer-events-none absolute top-1 right-3 opacity-85">
              <WeatherIcon kind={weatherKind(weather.current.symbol)} size={100} label={sky.label} />
            </span>
          )}
          {h.outdoorTemp != null ? (
            <span className="relative text-4xl leading-none font-extrabold tracking-tight md:text-[42px]">{fmtTemp(h.outdoorTemp)}<TrendArrow trend={h.outdoorTrend} /></span>
          ) : h.outdoorStale && (
            <span className="relative flex flex-col pr-24">
              <span className="text-2xl leading-tight font-extrabold">Ej tillgänglig</span>
              <span className="text-[13px] font-bold">Inget från väderstationen på 4 tim</span>
            </span>
          )}
          {!weather && <span className="relative text-[15px] font-bold opacity-80">Prognos ej tillgänglig</span>}
          {weather && (
            <span className="relative text-[15px] font-bold">
              {weather.nextPrecip && weather.nextPrecip.time <= weather.current.time
                ? `${sky?.label} just nu`
                : `${sky?.label} · ${
                    weather.nextPrecip
                      ? `${symbolInfo(weather.nextPrecip.symbol).label.toLowerCase()} från ${hhmm(weather.nextPrecip.time)}`
                      : 'uppehåll 6 tim'
                  }`}
            </span>
          )}
          {h.station && (
            <span className="relative flex flex-wrap items-center gap-x-2 text-[15px] font-bold">
              {h.station.wind != null && (
                <span>
                  Vind {fmtNum(h.station.wind)}{h.station.gust != null && h.station.gust > h.station.wind ? `–${fmtNum(h.station.gust)}` : ''} m/s{h.station.dir ? ` ${h.station.dir}` : ''}
                </span>
              )}
              {h.station.road != null && (
                <span className={h.station.road <= 0.5 ? 'rounded-full bg-danger-strong px-2 text-white' : ''}>
                  · Väg {fmtTemp(h.station.road)}{h.station.road <= 0.5 ? ' halka' : ''}
                </span>
              )}
            </span>
          )}
        </Hero>
        )}
        {h.lightsTotal > 0 && (
        <Hero bg={tint('#FFC21A', 0.5)} icon="bulb" label="Lampor tända">
          <span className="flex items-center justify-between gap-2">
            <span className="text-4xl leading-none font-extrabold tracking-tight md:text-[42px]">{h.lightsOn}</span>
            <span className="text-[15px] font-bold">av {h.lightsTotal}</span>
          </span>
        </Hero>
        )}
        {h.powerMeters > 0 && (
        <Hero bg={tint('#8B5CF6', 0.5)} icon="bolt" label="Effekt nu">
          <span className="text-4xl leading-none font-extrabold tracking-tight md:text-[42px]">{fmtWatt(h.powerW)}</span>
          <span className="text-[15px] font-bold">{h.powerMeters} mätare</span>
        </Hero>
        )}
        {price.now && (
        <Hero bg={price.level?.bg ?? 'var(--color-glass)'} icon="money" label={`Elpris ${PRICE_AREA}${price.level ? ` · ${price.level.label}` : ''}`}>
          <span className="text-4xl leading-none font-extrabold tracking-tight md:text-[42px]">
            {Math.round(price.now.ore)}
            <span className="text-xl"> öre</span>
          </span>
          <span className="text-[15px] font-bold">
            {price.cheapest1h && `Billigast ${hhmm(price.cheapest1h.start)}–${hhmm(price.cheapest1h.end)}`}
          </span>
        </Hero>
        )}
        {h.openings.length > 0 && (
        <Hero
          href="/larm#oppet"
          bg={open.length ? tint('#FF8A3D', 0.5) : tint('#12B76A', 0.42)}
          icon={open.length ? 'shieldAlert' : 'shield'}
          label="Dörrar & fönster"
        >
          <span className="text-3xl leading-none font-extrabold tracking-tight md:text-4xl">
            {open.length ? (open.length === 1 ? 'Öppen' : `${open.length} öppna`) : 'Stängt'}
          </span>
          <span className="truncate text-[15px] font-bold">
            {open.length === 1 ? open[0].name : entrance ? `Entré ${openedToday[entrance.id] ?? 0}× i dag` : `${h.openings.length} sensorer`}
          </span>
        </Hero>
        )}
      </section>

      {weather && (
        <div id="prognos" popover="auto" className="m-auto w-[min(94vw,880px)] rounded-[24px] border border-line bg-ground/95 p-4 text-fg shadow-2xl backdrop:bg-black/50">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-xl font-extrabold">Prognos · {weather.source ?? 'SMHI'}</h2>
            <button type="button" popoverTarget="prognos" popoverTargetAction="hide" className="rounded-full bg-glass-hi px-4 py-2 font-extrabold">Stäng</button>
          </div>
          <ol className="flex gap-2 overflow-x-auto pb-2">
            {weather.hours.map((w, i) => {
              const info = symbolInfo(w.symbol);
              return (
                <li key={w.time} className={`flex w-[68px] shrink-0 flex-col items-center gap-1 rounded-2xl px-1 py-2 ${i === 0 ? 'bg-glass-hi' : 'bg-glass-2'}`}>
                  <span className="text-[13px] font-bold text-dim">{i === 0 ? 'Nu' : hhmm(w.time)}</span>
                  <WeatherIcon kind={weatherKind(w.symbol)} size={40} label={info.label} />
                  <span className="text-lg font-extrabold">{Number.isFinite(w.temp) ? `${Math.round(w.temp)}°` : '–'}</span>
                  <span className={`text-[13px] font-bold ${w.precip >= 0.1 ? 'text-info' : 'text-mute'}`}>
                    {w.precip >= 0.1 ? `${w.precip.toLocaleString('sv-SE', { maximumFractionDigits: 1 })} mm` : '–'}
                  </span>
                </li>
              );
            })}
          </ol>
          {weather.days && weather.days.length > 0 && (
            <>
              <h3 className="mt-2 mb-2 text-lg font-extrabold">Kommande dagar</h3>
              <ol className="grid grid-cols-5 gap-2">
                {weather.days.map((d) => {
                  const info = symbolInfo(d.symbol);
                  const day = new Intl.DateTimeFormat('sv-SE', { weekday: 'short', timeZone: 'Europe/Stockholm' }).format(Date.parse(`${d.date}T12:00:00Z`));
                  return (
                    <li key={d.date} className="flex flex-col items-center gap-1 rounded-2xl bg-glass-2 px-1 py-2">
                      <span className="text-[13px] font-bold text-dim capitalize">{day.replace('.', '')}</span>
                      <WeatherIcon kind={weatherKind(d.symbol)} size={40} label={info.label} />
                      <span className="flex flex-col items-center leading-tight sm:flex-row sm:gap-1.5">
                        <span className="text-lg font-extrabold">{Math.round(d.max)}°</span>
                        <span className="text-[15px] font-bold text-dim">{Math.round(d.min)}°</span>
                      </span>
                      <span className={`text-[13px] font-bold ${d.precip >= 0.5 ? 'text-info' : 'text-mute'}`}>
                        {d.precip >= 0.5 ? `${d.precip.toLocaleString('sv-SE', { maximumFractionDigits: 1 })} mm` : '–'}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </div>
      )}

      <h2 className="-mb-1 text-xl font-extrabold">Rum</h2>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {h.rooms
          .filter((r) => r.temp != null || r.humidity != null || r.lights.length > 0)
          .map((r) => (
            <RoomTile key={r.id} room={r} />
          ))}
      </section>

      {/* Media: Google TV och det som castas (t.ex. Spotify på Nest hub). Pausat visas nedtonat. */}
      {playing.length > 0 && (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {playing.map((p) => (
            <div key={p.id} className={`glass flex min-h-14 items-center gap-2.5 rounded-[20px] px-3 py-1.5 ${p.playing ? '' : 'opacity-70'}`}>
              <span className="flex size-10 shrink-0 items-center justify-center rounded-[14px] bg-glass-hi">
                <Icon name={p.kind === 'tv' ? 'tv' : 'music'} size={22} />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[13px] font-bold text-dim">
                  {p.kind === 'tv' ? 'På TV:n' : 'Spelas upp'} · {p.playing ? p.device : `pausad på ${p.device}`}
                </span>
                <span className="truncate text-[17px] leading-tight font-extrabold">
                  {p.title}{p.subtitle && <span className="font-bold text-dim"> · {p.subtitle}</span>}
                </span>
              </span>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
