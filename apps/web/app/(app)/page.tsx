import Link from 'next/link';
import { TrendArrow } from '@/components/TrendArrow';
import { Clock } from '@/components/Clock';
import { Icon, type IconName } from '@/components/Icon';
import { SortableCards } from '@/components/SortableCards';
import { NowPlayingCard } from '@/components/NowPlayingCard';
import { CalendarWidget } from '@/components/CalendarWidget';
import { warningBanners } from '@/components/WarningBanners';
import { humidityWarnings, rainWarning } from '@/lib/alerts';
import { loadCommute, loadHome, loadNameDay, loadNet, loadWarnings, loadWine, loadNowPlaying, loadPrices, loadWeather } from '@/lib/data';
import { joinNames } from '@/lib/days';
import { compass } from '@/lib/home';
import { TONE_COLOR, commuteAlerts, direction, groupRoad, shortPlace, trainStatus, trainTone } from '@/lib/commute';
import { seenAgo } from '@/lib/time';
import { symbolInfo, weatherKind } from '@/lib/weather';
import { WeatherIcon } from '@/components/WeatherIcon';
import { hhmm, hourly, levelOf, summarize } from '@/lib/prices';
import { fmtTemp, fmtWatt, heatColor, tint } from '@/lib/scale';

export const dynamic = 'force-dynamic';


const fmtNum = (v: number) => v.toLocaleString('sv-SE', { maximumFractionDigits: 1 });

/** Storlek för de stora korten (Ute, Pendling): hela bredden i mobil, 2×2 på plattan. */
const BIG = 'col-span-2 lg:row-span-2';

/**
 * Kort på Hem: glas med svag färgton (lugn yta). Färgen syns i ikonen och kanten.
 * alert = läget kräver uppmärksamhet (öppen dörr, dyrt, försenat): då full mättnad.
 */
function Hero({ tone, alert, icon, label, href, popover, children }: {
  tone: string; alert?: boolean; icon: IconName; label: string; href?: string; popover?: string; children: React.ReactNode;
}) {
  const Box = href ? Link : popover ? 'button' : 'div';
  const extra = popover ? { type: 'button' as const, popoverTarget: popover, 'aria-label': `${label}, visa prognos` } : {};
  const rgb = hexRgb(tone);
  return (
    <Box
      href={href!} {...extra}
      className="relative flex h-full w-full min-w-0 flex-col gap-1.5 overflow-hidden rounded-[22px] border px-4 py-3 text-left backdrop-blur-md"
      style={{
        background: alert ? tint(tone, 0.55) : `linear-gradient(rgb(${rgb} / 0.13), rgb(${rgb} / 0.05)), rgb(14 18 32 / 0.55)`,
        borderColor: `rgb(${rgb} / ${alert ? 0.7 : 0.28})`,
      }}
    >
      <span className="relative flex min-w-0 items-center gap-2.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[14px]" style={{ background: `rgb(${rgb} / ${alert ? 0.35 : 0.2})` }}>
          <Icon name={icon} size={24} />
        </span>
        <span className="truncate text-[14px] font-bold text-fg/80">{label}</span>
      </span>
      {children}
    </Box>
  );
}

const hexRgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
};

/** Värde för små kort: stort tal nere till vänster, högst en kort rad bredvid. */
function Value({ value, aside }: { value: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <span className="mt-auto flex min-w-0 items-end justify-between gap-2">
      <span className="text-[38px] leading-none font-extrabold tracking-tight whitespace-nowrap">{value}</span>
      {aside && <span className="truncate pb-1 text-[14px] font-bold text-fg/75">{aside}</span>}
    </span>
  );
}

export default async function HomePage() {
  const [h, prices, weather, nameDay, nowPlayingAll, net, wine, commute] = await Promise.all([
    loadHome(), loadPrices(), loadWeather(), loadNameDay(), loadNowPlaying(), loadNet(), loadWine(), loadCommute(),
  ]);
  // Hem är bara visning: det som spelas visas, fjärren finns i rummet (Rum).
  const playing = nowPlayingAll;
  const bottomUsed = Math.min(playing.length, 2);
  const wx = await loadWarnings(weather);
  const banners = warningBanners(wx, 3);
  // Pendling: aktuell riktning (morgon mot Stockholm, annars hem) och störningar till varningsraden.
  const dir = direction();
  const trains = commute?.[dir] ?? [];
  const trafficAlerts = commute ? commuteAlerts(commute, Date.now(), hhmm) : [];
  const roads = commute ? groupRoad(commute.road) : [];
  const hasCal = !!(process.env.CALENDAR_ICAL_URL || process.env.ULRIKA_ICAL_URL);
  const bigN = [h.outdoorTemp != null || h.outdoorStale || !!weather, !!commute].filter(Boolean).length;
  const smallN = [h.lightsTotal > 0, h.openings.length > 0, h.powerMeters + h.powerEstimated > 0, prices.length > 0].filter(Boolean).length;
  // Rutor på två rader: stora kort 2×2, kalendern 2×1, små 1×1.
  const tempRooms = h.rooms.filter((r) => r.temp != null);
  const tempAvg = tempRooms.length ? tempRooms.reduce((a, r) => a + r.temp!, 0) / tempRooms.length : null;
  // Rutor i rutnätet (6 kolumner): stora 2×2, kalender och inomhus 2×1, små 1×1. Två eller tre rader efter behov.
  const cells = bigN * 4 + (hasCal ? 2 : 0) + (tempRooms.length ? 2 : 0) + smallN + (wine ? 1 : 0);
  const topRows = Math.max(2, Math.ceil(cells / 6));
  const names = joinNames(nameDay);
  // Utan egen väderstation (t.ex. Hue-hushåll) visas SMHI:s temperatur.
  const smhiTemp = !h.outdoorStale && h.outdoorTemp == null && weather && Number.isFinite(weather.current.temp) ? Math.round(weather.current.temp * 10) / 10 : null;
  // Utan väderstation i Homey (t.ex. Ulrika): Trafikverkets station Eskilstuna Ö direkt från API:t.
  const tvs = commute?.station ?? null;
  const station = h.station ?? (tvs ? { wind: tvs.wind, gust: tvs.gust, dir: tvs.deg != null ? compass(tvs.deg) : null, road: tvs.road } : null);
  const outTemp = h.outdoorTemp ?? tvs?.air ?? smhiTemp;
  const price = summarize(prices, Date.now());
  // Elpris: nästa timme (pil upp/ner) och de närmaste 8 timmarna som staplar när kortet är brett.
  const hours = hourly(prices);
  const curIdx = price.now ? hours.findIndex((p) => p.start <= price.now!.start && price.now!.start < p.end) : -1;
  const upcoming = curIdx >= 0 ? hours.slice(curIdx, curIdx + 8) : [];
  const nextPrice = curIdx >= 0 ? hours[curIdx + 1] ?? null : null;
  const maxUpcoming = Math.max(1, ...upcoming.map((p) => p.ore));
  // En tom ruta i rutnätet fylls genom att Elpris blir brett (med staplar).
  const priceWide = !!price.now && topRows * 6 - cells >= 1;
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
            · inga varningar (SMHI, VMA){commute ? (commute.trains ? ' · pendling utan störningar: tåg Eskilstuna–Stockholm, väg 56/E18 till Västerås' : ' · väg 56/E18 Eskilstuna–Västerås utan störningar') : ''}{net?.state === 'ok' ? ' · internet uppe' : ''}
          </span>
        </Link>
      )}

      {/* Kort i rutnät: Ute och Pendling stora (2×2), övriga lika stora. På plattan fyller rutnätet höjden.
          Korten går att ordna: håll inne, dra (byter bara med kort av samma storlek), tryck Klar. */}
      <div className="flex flex-col gap-4 lg:min-h-0 lg:flex-[1_1_0px]">
      <SortableCards
        storageKey="hem-kort-v2"
        className="grid grid-cols-2 gap-3 md:gap-4 lg:min-h-0 lg:flex-[1_1_0px] lg:grid-flow-dense lg:grid-cols-6 lg:[grid-template-rows:repeat(var(--rows),minmax(92px,1fr))]"
        style={{ '--rows': topRows } as React.CSSProperties}
        items={[
          ...((h.outdoorTemp != null || h.outdoorStale || weather) ? [{ id: 'ute', span: BIG, node: (
            <Hero popover={weather ? 'prognos' : undefined} tone={heatColor(outTemp)} alert={station?.road != null && station.road <= 0.5} icon="thermo" label={`Ute${weather?.source ? ` · ${weather.source}` : ''}`}>
              {sky && weather && (
                <span className="pointer-events-none absolute top-2 right-3 opacity-90">
                  <WeatherIcon kind={weatherKind(weather.current.symbol)} size={110} label={sky.label} />
                </span>
              )}
              {outTemp != null ? (
                <span className="relative text-[56px] leading-none font-extrabold tracking-tight md:text-[64px]">{fmtTemp(outTemp)}<TrendArrow trend={h.outdoorTrend} /></span>
              ) : h.outdoorStale && (
                <span className="relative flex flex-col pr-28">
                  <span className="text-2xl leading-tight font-extrabold">Ej tillgänglig</span>
                  <span className="text-[14px] font-bold text-fg/75">Inget från väderstationen på 4 tim</span>
                </span>
              )}
              {!weather && <span className="relative text-[15px] font-bold text-fg/75">Prognos ej tillgänglig</span>}
              {weather && (
                <span className="relative truncate text-[16px] font-bold">
                  {weather.nextPrecip && weather.nextPrecip.time <= weather.current.time
                    ? `${sky?.label} just nu`
                    : `${sky?.label} · ${weather.nextPrecip ? `${symbolInfo(weather.nextPrecip.symbol).label.toLowerCase()} från ${hhmm(weather.nextPrecip.time)}` : 'uppehåll 6 tim'}`}
                </span>
              )}
              {station && (
                <span className="relative flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] font-bold text-fg/85">
                  {station.wind != null && (
                    <span className="flex items-center gap-1"><Icon name="wind" size={18} />{fmtNum(station.wind)}{station.gust != null && station.gust > station.wind ? `–${fmtNum(station.gust)}` : ''} m/s{station.dir ? ` ${station.dir}` : ''}</span>
                  )}
                  {station.road != null && (
                    <span className={`flex items-center gap-1 ${station.road <= 0.5 ? 'rounded-full bg-danger-strong px-2 text-white' : ''}`}>
                      <Icon name="road" size={18} />{fmtTemp(station.road)}{station.road <= 0.5 ? ' halka' : ''}
                    </span>
                  )}
                </span>
              )}
              {weather && weather.hours.length > 1 && (
                <span className="relative mt-auto hidden justify-between gap-1.5 pt-1 lg:flex">
                  {weather.hours.slice(1, 5).map((w) => (
                    <span key={w.time} className="flex items-center gap-1 rounded-xl bg-black/20 px-2 py-1">
                      <span className="text-[13px] font-bold text-fg/75">{hhmm(w.time).slice(0, 2)}</span>
                      <WeatherIcon kind={weatherKind(w.symbol)} size={26} label={symbolInfo(w.symbol).label} />
                      <span className="text-[15px] font-extrabold">{Number.isFinite(w.temp) ? `${Math.round(w.temp)}°` : '–'}</span>
                    </span>
                  ))}
                </span>
              )}
            </Hero>
          ) }] : []),
          ...(commute?.trains ? [{ id: 'pendling', span: BIG, node: (
            <Hero href="/pendling" tone="#4FA3FF" alert={trains.slice(0, 3).some((t) => trainTone(t) === 'bad')} icon="train" label={`Pendling · ${dir === 'out' ? 'mot Stockholm' : 'mot Eskilstuna'}`}>
              {trains.length === 0 && <span className="mt-2 text-xl font-extrabold">Inga tåg de närmaste timmarna</span>}
              <span className="flex flex-col gap-1.5">
                {trains.slice(0, 3).map((t, i) => {
                  const tone = trainTone(t);
                  return (
                    <span key={t.id} className="flex items-center gap-2.5 rounded-[14px] bg-black/20 px-2.5 py-1">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full text-[13px] font-black text-[#0B0F1A]" style={{ background: TONE_COLOR[tone] }} aria-hidden="true">
                        {tone === 'ok' ? '✓' : tone === 'warn' ? '!' : '✕'}
                      </span>
                      <span className={`shrink-0 font-extrabold tabular-nums ${i === 0 ? 'text-[30px] leading-none' : 'text-[20px]'} ${t.canceled ? 'line-through opacity-60' : ''}`}>{hhmm(t.canceled ? t.dep : t.est ?? t.dep)}</span>
                      <span className="min-w-0 grow truncate text-[14px] font-bold text-fg/75">{t.track ? `spår ${t.track}` : t.dest}</span>
                      <span className="shrink-0 text-[14px] font-extrabold" style={{ color: tone === 'ok' ? undefined : TONE_COLOR[tone] }}>{trainStatus(t).text}</span>
                    </span>
                  );
                })}
              </span>
              <span className="mt-auto flex items-center gap-2 pt-1 text-[15px] font-bold">
                <Icon name="road" size={20} />
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: roads.length ? TONE_COLOR[roads.some((g) => g.tone === 'bad') ? 'bad' : 'warn'] : TONE_COLOR.ok }} />
                <span className="truncate">{roads.length === 0 ? 'Väg 56/E18: fritt' : roads.length === 1 ? `${roads[0].road}: ${roads[0].type.toLowerCase()}` : `Väg 56/E18: ${roads.length} ärenden`}</span>
              </span>
            </Hero>
          ) }] : []),
          // Bara väg (COMMUTE=road): stort kort med störningarna på väg 56/E18 i stället för tågen.
          ...(commute && !commute.trains ? [{ id: 'trafik', span: BIG, node: (
            <Hero href="/pendling" tone="#4FA3FF" alert={roads.some((g) => g.tone === 'bad')} icon="road" label="Väg 56/E18 · Eskilstuna–Västerås">
              {roads.length === 0 ? (
                <span className="mt-auto flex items-center gap-3 text-[28px] font-extrabold">
                  <span className="flex size-9 items-center justify-center rounded-full text-[18px] text-[#0B0F1A]" style={{ background: TONE_COLOR.ok }}>✓</span> Fritt
                </span>
              ) : (
                <span className="flex flex-col gap-1.5">
                  {roads.slice(0, 3).map((g) => (
                    <span key={g.id} className="flex min-w-0 items-center gap-2 rounded-[14px] bg-black/20 px-2.5 py-1.5">
                      <span className="size-3 shrink-0 rounded-full" style={{ background: TONE_COLOR[g.tone] }} />
                      <span className="shrink-0 rounded-md bg-black/25 px-1.5 text-[12px] font-extrabold">{g.road}</span>
                      <span className="shrink-0 text-[16px] font-extrabold">{g.type}{g.count > 1 ? ` ×${g.count}` : ''}</span>
                      <span className="min-w-0 truncate text-[14px] font-bold text-fg/75">{g.places.map(shortPlace).filter(Boolean)[0] ?? ''}</span>
                    </span>
                  ))}
                  {roads.length > 3 && <span className="text-[14px] font-bold text-fg/75">+ {roads.length - 3} till</span>}
                </span>
              )}
            </Hero>
          ) }] : []),
          // Kalender (Google-kalender via hemlig iCal-adress): bara när en adress finns på servern. Adressen skickas aldrig hit.
          ...(hasCal ? [{ id: 'kalender', span: 'col-span-2', node: <CalendarWidget /> }] : []),
          // Inomhus: snittemperatur stort, rummen i mindre text bredvid (bara visning).
          ...(tempAvg != null ? [{ id: 'inomhus', span: 'col-span-2', node: (
            <Hero href="/rum" tone={heatColor(tempAvg)} icon="thermo" label="Inomhus · snitt">
              {/* Snittet stort uppe till höger, rummen i tre kolumner under. */}
              <span className="absolute top-2 right-4 text-[44px] leading-none font-extrabold tracking-tight">{fmtTemp(Math.round(tempAvg * 10) / 10)}</span>
              <span className="mt-auto grid min-w-0 grid-cols-2 gap-x-5 gap-y-0.5 text-[13px] font-bold">
                {tempRooms.map((r) => (
                  <span key={r.id} className="flex min-w-0 items-center gap-1.5">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: heatColor(r.temp) }} />
                    <span className="truncate text-fg/75">{r.name}</span>
                    <span className="ml-auto shrink-0">{fmtTemp(r.temp)}</span>
                  </span>
                ))}
              </span>
            </Hero>
          ) }] : []),
          // Vinkällaren (Trandvine): öppnar Trandvine i nytt fönster.
          ...(wine ? [{ id: 'vin', node: (
            <a href="https://wine.trand.se" target="_blank" rel="noopener noreferrer" title="Öppna Trandvine i nytt fönster" className="flex h-full w-full min-w-0">
              <Hero tone="#C2416B" icon="wine" label="Vinkällaren ↗">
                <Value value={<>{wine.total}<span className="text-lg"> fl</span></>} />
              </Hero>
            </a>
          ) }] : []),
          ...(h.lightsTotal > 0 ? [{ id: 'lampor', node: (
            <Hero tone="#FFC21A" icon="bulb" label="Lampor">
              <Value value={h.lightsOn} aside={`av ${h.lightsTotal}`} />
            </Hero>
          ) }] : []),
          ...(h.openings.length > 0 ? [{ id: 'dorrar', node: (
            <Hero href="/larm#oppet" tone={open.length ? '#FF8A3D' : '#34C27A'} alert={open.length > 0} icon={open.length ? 'shieldAlert' : 'shield'} label="Dörrar">
              <Value value={open.length ? (open.length === 1 ? 'Öppen' : `${open.length} öppna`) : 'Stängt'} aside={open.length === 1 ? open[0].name : undefined} />
            </Hero>
          ) }] : []),
          ...(h.powerMeters + h.powerEstimated > 0 ? [{ id: 'effekt', node: (
            <Hero tone="#8B5CF6" icon="bolt" label="Effekt nu">
              <Value value={fmtWatt(h.powerW)} />
            </Hero>
          ) }] : []),
          ...(price.now ? [{ id: 'elpris', span: priceWide ? 'lg:col-span-2' : undefined, node: (
            <Hero tone={price.level?.bar ?? '#E8B400'} alert={price.level?.key === 'high' || price.level?.key === 'peak'} icon="money" label={`Elpris${price.level ? ` · ${price.level.label}` : ''}`}>
              <span className="mt-auto flex min-w-0 items-end gap-3">
                <span className="text-[38px] leading-none font-extrabold tracking-tight whitespace-nowrap">
                  {Math.round(price.now.ore)}<span className="text-lg"> öre</span>
                </span>
                {nextPrice && (
                  <span className="pb-1 text-[15px] font-extrabold whitespace-nowrap" style={{ color: nextPrice.ore > price.now.ore ? '#FF8A3D' : '#34C27A' }} title="Nästa timme">
                    {nextPrice.ore > price.now.ore ? '▲' : '▼'} {Math.round(nextPrice.ore)}
                  </span>
                )}
                {/* Brett kort: staplar för de närmaste timmarna. */}
                {priceWide && (
                  <span className="ml-auto hidden h-11 grow items-end justify-end gap-1 lg:flex" aria-hidden="true">
                    {upcoming.map((p, i) => (
                      <span key={p.start} className="w-full max-w-4 rounded-t-[4px]" style={{ height: `${Math.max(12, (p.ore / maxUpcoming) * 100)}%`, background: i === 0 ? '#FFFFFF' : `rgb(${hexRgb(levelOf(p.ore, price.todayAvg).bar)} / 0.85)` }} />
                    ))}
                  </span>
                )}
              </span>
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

      </div>

      {/* Fast plats längst ner: det som spelas, annars (eller bredvid) en kort prognos för kommande dagar. */}
      {(playing.length > 0 || (weather?.days?.length ?? 0) > 0) && (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {playing.slice(0, 2).map((p) => <NowPlayingCard key={p.id} p={p} />)}
          {bottomUsed < 2 && weather?.days && weather.days.length > 0 && (
            <button
              type="button" popoverTarget="prognos" aria-label="Visa prognos"
              className={`glass flex min-h-16 items-center justify-around gap-2 rounded-[20px] border border-line px-3 py-1.5 ${bottomUsed === 0 ? 'md:col-span-2' : ''}`}
            >
              {weather.days.slice(0, bottomUsed === 0 ? 5 : 3).map((d) => {
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
