import Link from 'next/link';
import { Clock } from '@/components/Clock';
import { Icon, type IconName } from '@/components/Icon';
import { RoomTile } from '@/components/RoomTile';
import { MoodButtons } from '@/components/MoodButtons';
import { humidityWarnings, rainWarning } from '@/lib/alerts';
import { loadHome, loadMotionCount, loadNameDay, loadNowPlaying, loadOpeningsToday, loadPrices, loadWeather } from '@/lib/data';
import { joinNames } from '@/lib/days';
import { symbolInfo, weatherKind } from '@/lib/weather';
import { WeatherIcon } from '@/components/WeatherIcon';
import { PRICE_AREA, hhmm, summarize } from '@/lib/prices';
import { HEAT, fmtTemp, fmtWatt, heatTint, tint } from '@/lib/scale';

export const dynamic = 'force-dynamic';

function Hero({ bg, icon, label, children }: { bg: string; icon: IconName; label: string; children: React.ReactNode }) {
  return (
    <div className="glass relative flex flex-col gap-1 overflow-hidden rounded-[24px] p-4" style={{ background: bg }}>
      <span className="relative flex items-center gap-2.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-glass-hi">
          <Icon name={icon} size={22} />
        </span>
        <span className="text-[15px] font-bold">{label}</span>
      </span>
      {children}
    </div>
  );
}

function Status({ icon, label, value, tone, href }: { icon: IconName; label: string; value: string; tone: 'ok' | 'info' | 'warn'; href?: string }) {
  const tones = {
    ok: ['glass', 'bg-glass-hi', 'text-dim'],
    info: ['glass', 'bg-glass-hi', 'text-dim'],
    warn: ['bg-warn-soft shadow-[inset_0_0_0_2px_var(--color-warn-strong)]', 'bg-glass-hi', 'text-warn'],
  }[tone];
  const cls = `flex min-h-[76px] items-center gap-3 rounded-[22px] px-4 py-2.5 ${tones[0]}`;
  const body = (
    <>
      <span className={`flex size-12 shrink-0 items-center justify-center rounded-[16px] ${tones[1]}`}>
        <Icon name={icon} size={26} />
      </span>
      <span className="flex flex-col gap-0.5">
        <span className={`font-bold ${tones[2]}`}>{label}</span>
        <span className="text-xl leading-tight font-extrabold">{value}</span>
      </span>
    </>
  );
  return href ? <Link href={href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

export default async function HomePage() {
  const [h, prices, weather, motions, openedToday, nameDay, playing] = await Promise.all([
    loadHome(), loadPrices(), loadWeather(), loadMotionCount(), loadOpeningsToday(), loadNameDay(), loadNowPlaying(),
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
            {names && <span> · namnsdag {names}</span>}
          </p>
          <h1 className="text-[32px] leading-tight font-extrabold tracking-tight">Hemma</h1>
        </div>
        {/* Varningar: i rubrikraden på plattan (sparar höjd), egen rad på mobil. */}
        {(warning || damp.length > 0) && (
          <div className="order-last flex w-full min-w-0 flex-col gap-1.5 lg:order-none lg:w-auto lg:grow">
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
          <span className="hidden items-center gap-2 rounded-full bg-ok-soft px-3 py-1.5 text-[14px] font-bold text-ok xl:flex">
            <span className="size-2.5 rounded-full bg-ok" />
            Live · {h.online} enheter
          </span>
          <Clock show="time" className="text-3xl leading-none font-extrabold tracking-tight md:text-4xl" />
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:auto-cols-fr lg:grid-flow-col">
        {(h.outdoorTemp != null || weather) && (
        <Hero bg={heatTint(h.outdoorTemp)} icon="thermo" label="Ute">
          {/* Stor vädersymbol, ca 1/4 av kortet, lätt genomskinlig mot tonen. */}
          {sky && weather && (
            <span className="pointer-events-none absolute top-1 -right-1 opacity-85">
              <WeatherIcon kind={weatherKind(weather.current.symbol)} size={120} label={sky.label} />
            </span>
          )}
          {h.outdoorTemp != null && (
            <span className="relative text-4xl leading-none font-extrabold tracking-tight md:text-5xl">{fmtTemp(h.outdoorTemp)}</span>
          )}
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
        </Hero>
        )}
        {h.lightsTotal > 0 && (
        <Hero bg={tint('#FFC21A', 0.28)} icon="bulb" label="Lampor tända">
          <span className="flex items-center justify-between gap-2">
            <span className="text-4xl leading-none font-extrabold tracking-tight md:text-5xl">{h.lightsOn}</span>
            <span className="text-[15px] font-bold">av {h.lightsTotal}</span>
          </span>
        </Hero>
        )}
        {h.powerMeters > 0 && (
        <Hero bg={tint('#8B5CF6', 0.28)} icon="bolt" label="Effekt nu">
          <span className="text-4xl leading-none font-extrabold tracking-tight md:text-5xl">{fmtWatt(h.powerW)}</span>
          <span className="text-[15px] font-bold">{h.powerMeters} mätare</span>
        </Hero>
        )}
        {price.now && (
        <Hero bg={price.level?.bg ?? 'var(--color-glass)'} icon="money" label={`Elpris ${PRICE_AREA}${price.level ? ` · ${price.level.label}` : ''}`}>
          <span className="text-4xl leading-none font-extrabold tracking-tight md:text-5xl">
            {Math.round(price.now.ore)}
            <span className="text-xl"> öre</span>
          </span>
          <span className="text-[15px] font-bold">
            {price.cheapest1h && `Billigast ${hhmm(price.cheapest1h.start)}–${hhmm(price.cheapest1h.end)}`}
          </span>
        </Hero>
        )}
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Status
          icon={open.length ? 'shieldAlert' : 'shield'}
          label={entrance ? `Dörrar · entré ${openedToday[entrance.id] ?? 0}× i dag` : 'Dörrar & fönster'}
          value={open.length ? (open.length === 1 ? `${open[0].name} öppen` : `${open.length} öppna`) : 'Alla stängda'}
          tone={open.length ? 'warn' : 'ok'}
          href="/larm#oppet"
        />
        <Status
          icon="motion"
          label={h.motion ? `Rörelse · ${h.motion} aktiv nu` : 'Rörelse senaste timmen'}
          value={motions ? `${motions} registreringar` : 'Lugnt'}
          tone="info"
        />
        <Status
          icon="battery"
          label="Batteri"
          value={h.lowBattery ? `${h.lowBattery} låga` : 'Alla ok'}
          tone={h.lowBattery ? 'warn' : 'ok'}
          href="/larm#batteri"
        />
        <Status
          icon="wifi"
          label="Enheter"
          value={h.silent.length ? `${h.silent.length} svarar inte` : `${h.online} online`}
          tone={h.silent.length ? 'warn' : 'ok'}
          href="/larm#enheter"
        />
      </section>

      {h.favoriteMoods.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-[22px] font-extrabold">Favoriter</h2>
          <MoodButtons moods={h.favoriteMoods} />
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-[22px] font-extrabold">Rum</h2>
        <div className="flex flex-wrap gap-1.5 text-[13px] font-bold text-fg">
          {HEAT.map((s) => (
            <span key={s.label} className="rounded-full px-2.5 py-1" style={{ background: tint(s.color, 0.35) }}>
              {s.label}
            </span>
          ))}
        </div>
      </div>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {h.rooms
          .filter((r) => r.temp != null || r.humidity != null || r.lights.length > 0)
          .map((r) => (
            <RoomTile key={r.id} room={r} />
          ))}
      </section>

      {/* Spelas nu: visas bara när något spelar. */}
      {playing.length > 0 && (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {playing.map((p) => (
            <div key={p.id} className="glass flex min-h-[76px] items-center gap-3 rounded-[22px] px-4 py-2.5">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-[16px] bg-glass-hi">
                <Icon name="tv" size={26} />
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate font-bold text-dim">Spelas nu · {p.device}</span>
                <span className="truncate text-xl leading-tight font-extrabold">{p.title}</span>
                {p.subtitle && <span className="truncate text-[15px] font-bold text-dim">{p.subtitle}</span>}
              </span>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
