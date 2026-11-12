import Link from 'next/link';
import { TrendArrow } from '@/components/TrendArrow';
import { Clock } from '@/components/Clock';
import { Icon, type IconName } from '@/components/Icon';
import { RoomTile } from '@/components/RoomTile';
import { SortableCards } from '@/components/SortableCards';
import { NowPlayingCard } from '@/components/NowPlayingCard';
import { warningBanners } from '@/components/WarningBanners';
import { humidityWarnings, rainWarning } from '@/lib/alerts';
import { loadCommute, loadHome, loadNameDay, loadNet, loadWarnings, loadWine, loadNowPlaying, loadOpeningsToday, loadPrices, loadWeather } from '@/lib/data';
import { joinNames } from '@/lib/days';
import { TONE_COLOR, commuteAlerts, direction, groupRoad, trainStatus, trainTone } from '@/lib/commute';
import { seenAgo } from '@/lib/time';
import { symbolInfo, weatherKind } from '@/lib/weather';
import { WeatherIcon } from '@/components/WeatherIcon';
import { PRICE_AREA, hhmm, summarize } from '@/lib/prices';
import { fmtTemp, fmtWatt, heatTint, tint } from '@/lib/scale';

export const dynamic = 'force-dynamic';

/** Vinfärger från Trandvine: ordning, namn och färgprick. */
const WINE_ORDER = ['red', 'white', 'rose', 'sparkling', 'dessert', 'fortified', 'okänd'];
const WINE_COLOR: Record<string, string> = { red: 'Röda', white: 'Vita', rose: 'Rosé', sparkling: 'Bubbel', dessert: 'Dessert', fortified: 'Starkvin', 'okänd': 'Övriga' };
const WINE_DOT: Record<string, string> = { red: '#9B1B30', white: '#F2E6A8', rose: '#F4A6B8', sparkling: '#F7E7A1', dessert: '#D69A2D', fortified: '#6B2A1A', 'okänd': '#9AA1B5' };

const fmtNum = (v: number) => v.toLocaleString('sv-SE', { maximumFractionDigits: 1 });

/** Storlek för de stora korten (Ute, Pendling): hela bredden i mobil, 2×2 på plattan. */
const BIG = 'col-span-2 lg:row-span-2';

function Hero({ bg, icon, label, href, popover, children }: {
  bg: string; icon: IconName; label: string; href?: string; popover?: string; children: React.ReactNode;
}) {
  // Länk, knapp som öppnar en popup (native popover) eller vanlig ruta. Fyller sin ruta i rutnätet.
  const Box = href ? Link : popover ? 'button' : 'div';
  const extra = popover ? { type: 'button' as const, popoverTarget: popover, 'aria-label': `${label}, visa prognos` } : {};
  return (
    <Box href={href!} {...extra} className="glass relative flex h-full w-full min-w-0 flex-col gap-1 overflow-hidden rounded-[22px] px-3 py-2.5 text-left" style={{ background: bg }}>
      <span className="relative flex min-w-0 items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-glass-hi">
          <Icon name={icon} size={18} />
        </span>
        <span className="truncate text-[15px] font-bold">{label}</span>
      </span>
      {children}
    </Box>
  );
}

/** Värderad för små kort: stort värde nere till vänster, kort tillägg till höger. */
function Value({ value, aside, small }: { value: React.ReactNode; aside?: string; small?: boolean }) {
  return (
    <span className="mt-auto flex min-w-0 items-end justify-between gap-2">
      <span className={`leading-none font-extrabold tracking-tight whitespace-nowrap ${small ? 'text-[26px]' : 'text-[34px]'}`}>{value}</span>
      {aside && <span className="truncate pb-0.5 text-[13px] font-bold opacity-90">{aside}</span>}
    </span>
  );
}

export default async function HomePage() {
  const [h, prices, weather, openedToday, nameDay, playing, net, wine, commute] = await Promise.all([
    loadHome(), loadPrices(), loadWeather(), loadOpeningsToday(), loadNameDay(), loadNowPlaying(), loadNet(), loadWine(), loadCommute(),
  ]);
  const wx = await loadWarnings(weather);
  const banners = warningBanners(wx, 3);
  // Pendling: aktuell riktning (morgon mot Stockholm, annars hem) och störningar till varningsraden.
  const dir = direction();
  const trains = commute?.[dir] ?? [];
  const trafficAlerts = commute ? commuteAlerts(commute, Date.now(), hhmm) : [];
  const roads = commute ? groupRoad(commute.road) : [];
  const shownRooms = h.rooms.filter((r) => r.temp != null || r.humidity != null || r.lights.length > 0);
  const names = joinNames(nameDay);
  // Utan egen väderstation (t.ex. Hue-hushåll) visas SMHI:s temperatur.
  const smhiTemp = !h.outdoorStale && h.outdoorTemp == null && weather && Number.isFinite(weather.current.temp) ? Math.round(weather.current.temp * 10) / 10 : null;
  const outTemp = h.outdoorTemp ?? smhiTemp;
  const entrance = h.openings.find((o) => o.kind === 'door' && /entr|ytterdörr|front/i.test(o.name));
  const price = summarize(prices, Date.now());
  const open = h.openings.filter((o) => o.open);
  const sky = weather ? symbolInfo(weather.current.symbol) : null;
  const warning = rainWarning(weather, h.openings);
  const damp = humidityWarnings(h.rooms);

  return (
    <div className="flex flex-col gap-3 lg:min-h-[calc(100dvh-2rem)]">
      {/* Rubrik: tid och datum samlat till vänster (läsbart på håll), närvaro till höger. */}
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <h1 className="sr-only">Hemma</h1>
        <div className="flex min-w-0 items-center gap-4">
          <Clock show="time" className="text-[52px] leading-none font-extrabold tracking-tight tabular-nums md:text-[58px]" />
          <div className="flex min-w-0 flex-col leading-tight">
            <Clock show="date" className="text-xl font-extrabold first-letter:uppercase" />
            {names && (
              <span className="text-[15px] font-bold text-dim">
                Namnsdag <span className="text-sun">{names}</span>
              </span>
            )}
          </div>
        </div>
        {/* Höger: diskret versionsnotering ovanför närvaron. */}
        <div className="flex flex-col items-end gap-1">
          <span className="text-[11px] font-bold text-mute" title="Byggdatum och version">
            v{process.env.NEXT_PUBLIC_BUILT} · {process.env.NEXT_PUBLIC_COMMIT}
          </span>
          {/* Närvaro (Smart Presence): grönt = hemma, dov röd = borta med senast sedd. */}
          {h.people.length > 0 && (
            <ul aria-label="Närvaro" className="flex flex-wrap items-center gap-1.5">
              {[...h.people].sort((x, y) => Number(y.present) - Number(x.present) || (y.since ?? '').localeCompare(x.since ?? '')).map((p) => (
                <li
                  key={p.id}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[15px] font-extrabold ${p.present ? 'bg-ok-soft text-ok' : 'bg-[rgb(240_80_60/0.2)] text-danger'}`}
                  title={p.present ? `${p.name} är hemma` : `${p.name} är borta`}
                >
                  <span className={`size-2 rounded-full ${p.present ? 'bg-ok' : 'bg-danger'}`} />
                  {p.name}
                  {!p.present && p.since && <span className="font-bold opacity-80">· {seenAgo(p.since)}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </header>

      {/* Varningar: egen rad i full bredd, bara när något kräver åtgärd. Sida vid sida på plattan. */}
      {/* Fast plats för varningar: när inget händer visas en lugn statusrad i stället (ingen tom lucka, inget som hoppar). */}
      {(warning || damp.length > 0 || net?.state === 'down' || banners.length > 0 || trafficAlerts.length > 0) ? (
        <div className="flex flex-col gap-2 lg:min-h-[36px] lg:flex-row">
          {banners}
          {trafficAlerts.slice(0, Math.max(1, 3 - banners.length)).map((a) => (
            <Link key={a.id} href="/pendling" role="alert" className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-[16px] px-3.5 py-1.5 ${a.tone === 'bad' ? 'bg-danger-strong text-white' : 'bg-[#E8B400] text-[#1A1205]'}`}>
              <Icon name={a.kind === 'train' ? 'train' : 'road'} size={22} />
              <span className="font-extrabold lg:truncate">{a.label}</span>
            </Link>
          ))}
          {net?.state === 'down' && (
            <Link href="/larm#natverk" role="alert" className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[16px] bg-danger-strong px-3.5 py-1.5 text-white">
              <Icon name="wifi" size={22} />
              <span className="font-extrabold lg:truncate">Internet nere{net.isp ? ` · ${net.isp}` : ''} – kolla routern</span>
            </Link>
          )}
          {warning && (
            <Link href="/larm" role="alert" className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[16px] bg-info-strong px-3.5 py-1.5 text-white">
              <Icon name="rain" size={22} />
              <span className="font-extrabold lg:truncate">
                Nederbörd kl {hhmm(warning.at)} – stäng {warning.windows.map((w) => w.name).join(', ')}
              </span>
            </Link>
          )}
          {damp.length > 0 && (
            <Link href="/larm#fukt" role="alert" className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[16px] bg-teal px-3.5 py-1.5 text-white">
              <Icon name="drop" size={22} />
              <span className="font-extrabold lg:truncate">
                Fukt {damp.map((r) => `${r.name} ${Math.round(r.humidity!)} %`).join(', ')} – vädra eller kör fläkten
              </span>
            </Link>
          )}
        </div>
      ) : (
        <Link href="/larm" className="flex min-h-[36px] min-w-0 items-center gap-2.5 rounded-[16px] bg-glass-2 px-3.5 py-1.5 text-dim">
          <span className="size-2.5 shrink-0 rounded-full bg-ok shadow-[0_0_0_4px_rgb(52_194_122/0.18)]" />
          <span className="font-extrabold text-ok">Allt lugnt</span>
          <span className="truncate font-bold">
            · inga varningar (SMHI, VMA){commute ? ' · pendling utan störningar: tåg Eskilstuna–Stockholm, väg 56/E18 till Västerås' : ''}{net?.state === 'ok' ? ' · internet uppe' : ''}
          </span>
        </Link>
      )}

      {/* Kort i rutnät: Ute och Pendling stora (2×2), övriga lika stora. På plattan fyller rutnätet höjden.
          Korten går att ordna: håll inne, dra (byter bara med kort av samma storlek), tryck Klar. */}
      <div className="flex flex-col gap-3 lg:min-h-0 lg:flex-1">
      <SortableCards
        storageKey="hem-kort-v2"
        className="grid grid-cols-2 gap-3 lg:min-h-0 lg:flex-1 lg:grid-flow-dense lg:grid-cols-6 lg:[grid-template-rows:repeat(2,minmax(92px,1fr))]"
        items={[
          ...((h.outdoorTemp != null || h.outdoorStale || weather) ? [{ id: 'ute', span: BIG, node: (
            <Hero popover={weather ? 'prognos' : undefined} bg={heatTint(outTemp)} icon="thermo" label={`Ute${weather?.source ? ` · ${weather.source}` : ''}`}>
              {sky && weather && (
                <span className="pointer-events-none absolute top-1 right-3 opacity-85">
                  <WeatherIcon kind={weatherKind(weather.current.symbol)} size={92} label={sky.label} />
                </span>
              )}
              {outTemp != null ? (
                <span className="relative text-4xl leading-none font-extrabold tracking-tight md:text-[44px]">{fmtTemp(outTemp)}<TrendArrow trend={h.outdoorTrend} /></span>
              ) : h.outdoorStale && (
                <span className="relative flex flex-col pr-24">
                  <span className="text-2xl leading-tight font-extrabold">Ej tillgänglig</span>
                  <span className="text-[13px] font-bold">Inget från väderstationen på 4 tim</span>
                </span>
              )}
              {!weather && <span className="relative text-[15px] font-bold opacity-80">Prognos ej tillgänglig</span>}
              {weather && (
                <span className="relative truncate text-[15px] font-bold">
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
              {/* De närmaste timmarna längst ner. */}
              {weather && weather.hours.length > 1 && (
                <span className="relative mt-auto hidden justify-between gap-1 pt-1 lg:flex">
                  {weather.hours.slice(1, 5).map((w) => (
                    <span key={w.time} className="flex items-center gap-1 rounded-xl bg-black/15 px-1.5 py-0.5">
                      <span className="text-[13px] font-bold opacity-85">{hhmm(w.time).slice(0, 2)}</span>
                      <WeatherIcon kind={weatherKind(w.symbol)} size={22} label={symbolInfo(w.symbol).label} />
                      <span className="text-[14px] font-extrabold">{Number.isFinite(w.temp) ? `${Math.round(w.temp)}°` : '–'}</span>
                    </span>
                  ))}
                </span>
              )}
            </Hero>
          ) }] : []),
          ...(commute ? [{ id: 'pendling', span: BIG, node: (
            <Hero href="/pendling" bg={tint('#4FA3FF', 0.4)} icon="train" label={`Pendling · ${dir === 'out' ? 'mot Stockholm' : 'mot Eskilstuna'}`}>
              {trains.length === 0 && <span className="text-xl font-extrabold">Inga tåg de närmaste timmarna</span>}
              <span className="flex flex-col gap-1">
                {trains.slice(0, 3).map((t) => (
                  <span key={t.id} className="flex items-center gap-2 rounded-xl px-2 py-0.5" style={{ background: tint(TONE_COLOR[trainTone(t)], 0.5) }}>
                    <span className={`w-[52px] shrink-0 text-lg font-extrabold tabular-nums ${t.canceled ? 'line-through opacity-70' : ''}`}>{hhmm(t.canceled ? t.dep : t.est ?? t.dep)}</span>
                    <span className="min-w-0 grow truncate text-[14px] font-bold">{t.dest}{t.track ? ` · spår ${t.track}` : ''}</span>
                    <span className="shrink-0 text-[13px] font-extrabold">{trainStatus(t).text}</span>
                  </span>
                ))}
              </span>
              {/* Vägen till Västerås: en rad med värsta läget. */}
              <span className="mt-auto flex items-center gap-2 pt-1 text-[14px] font-bold">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: roads.length ? TONE_COLOR[roads.some((g) => g.tone === 'bad') ? 'bad' : 'warn'] : TONE_COLOR.ok }} />
                <span className="truncate">
                  {roads.length === 0 ? 'Väg 56/E18: fritt' : roads.length === 1 ? `${roads[0].road}: ${roads[0].type.toLowerCase()}` : `Väg 56/E18: ${roads.length} ärenden`}
                </span>
              </span>
            </Hero>
          ) }] : []),
          ...(h.lightsTotal > 0 ? [{ id: 'lampor', node: (
            <Hero bg={tint('#FFC21A', 0.5)} icon="bulb" label="Lampor">
              <Value value={h.lightsOn} aside={`av ${h.lightsTotal}`} />
            </Hero>
          ) }] : []),
          ...(h.openings.length > 0 ? [{ id: 'dorrar', node: (
            <Hero href="/larm#oppet" bg={open.length ? tint('#FF8A3D', 0.5) : tint('#12B76A', 0.42)} icon={open.length ? 'shieldAlert' : 'shield'} label="Dörrar">
              <Value
                value={open.length ? (open.length === 1 ? 'Öppen' : `${open.length} öppna`) : 'Stängt'} small
                aside={open.length === 1 ? open[0].name : entrance ? `Entré ${openedToday[entrance.id] ?? 0}×` : `${h.openings.length} st`}
              />
            </Hero>
          ) }] : []),
          ...(h.powerMeters + h.powerEstimated > 0 ? [{ id: 'effekt', node: (
            <Hero bg={tint('#8B5CF6', 0.5)} icon="bolt" label="Effekt">
              <Value value={fmtWatt(h.powerW)} small aside={h.powerEstimated ? 'delvis uppsk.' : `${h.powerMeters} mätare`} />
            </Hero>
          ) }] : []),
          ...(price.now ? [{ id: 'elpris', node: (
            <Hero bg={price.level?.bg ?? 'var(--color-glass)'} icon="money" label={`Elpris${price.level ? ` · ${price.level.label}` : ''}`}>
              <Value value={<>{Math.round(price.now.ore)}<span className="text-lg"> öre</span></>} aside={price.cheapest1h ? `bill. kl ${hhmm(price.cheapest1h.start).slice(0, 2)}` : PRICE_AREA} />
            </Hero>
          ) }] : []),
        ]}
      />
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

      <h2 className="sr-only">Rum</h2>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:min-h-0 lg:flex-[1.3] lg:grid-cols-6 lg:[grid-template-rows:repeat(var(--rows),minmax(118px,1fr))]" style={{ '--rows': Math.max(1, Math.ceil((shownRooms.length + (wine ? 1 : 0)) / 6)) } as React.CSSProperties}>
        {shownRooms.map((r) => (
          <RoomTile key={r.id} room={r} />
        ))}
        {/* Vinkällaren (Trandvine) som ett eget rumskort. */}
        {wine && (
          <a
            href="https://wine.trand.se" target="_blank" rel="noopener noreferrer" title="Öppna Trandvine i nytt fönster"
            className="flex h-full min-h-[118px] flex-col gap-1 overflow-hidden rounded-[20px] p-2.5" style={{ background: tint('#9B2C4A', 0.5) }}
          >
            <span className="flex items-center gap-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-glass-hi">
                <Icon name="wine" size={20} />
              </span>
              <span className="min-w-0 grow truncate text-[17px] font-extrabold">Vinkällaren</span>
              <span className="text-dim" aria-hidden="true">↗</span>
            </span>
            <span className="flex items-baseline gap-1.5">
              <span className="text-[26px] leading-none font-extrabold tracking-tight">{wine.total}</span>
              <span className="font-extrabold">flaskor</span>
            </span>
            <span className="mt-auto flex flex-wrap gap-x-2 gap-y-0.5 text-[13px] font-bold">
              {WINE_ORDER.filter((c) => wine.by_color[c]).map((c) => (
                <span key={c} className="flex items-center gap-1">
                  <span className="size-2.5 rounded-full shadow-[0_0_0_1px_rgb(255_255_255/0.4)]" style={{ background: WINE_DOT[c] }} />
                  {WINE_COLOR[c]} {wine.by_color[c]}
                </span>
              ))}
            </span>
          </a>
        )}
      </section>
      </div>

      {/* Fast plats längst ner: det som spelas, annars (eller bredvid) en kort prognos för kommande dagar. */}
      {(playing.length > 0 || (weather?.days?.length ?? 0) > 0) && (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {playing.slice(0, 2).map((p) => <NowPlayingCard key={p.id} p={p} />)}
          {playing.length < 2 && weather?.days && weather.days.length > 0 && (
            <button
              type="button" popoverTarget="prognos" aria-label="Visa prognos"
              className={`glass flex min-h-16 items-center justify-around gap-2 rounded-[20px] border border-line px-3 py-1.5 ${playing.length === 0 ? 'md:col-span-2' : ''}`}
            >
              {weather.days.slice(0, playing.length === 0 ? 5 : 3).map((d) => {
                const day = new Intl.DateTimeFormat('sv-SE', { weekday: 'short', timeZone: 'Europe/Stockholm' }).format(Date.parse(`${d.date}T12:00:00Z`));
                return (
                  <span key={d.date} className="flex items-center gap-1.5">
                    <span className="text-[14px] font-bold text-dim capitalize">{day.replace('.', '')}</span>
                    <WeatherIcon kind={weatherKind(d.symbol)} size={34} label={symbolInfo(d.symbol).label} />
                    <span className="text-lg font-extrabold">{Math.round(d.max)}°</span>
                    <span className="font-bold text-dim">{Math.round(d.min)}°</span>
                  </span>
                );
              })}
            </button>
          )}
        </section>
      )}
    </div>
  );
}
