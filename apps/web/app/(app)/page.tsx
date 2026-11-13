import Link from 'next/link';
import { TrendArrow } from '@/components/TrendArrow';
import { Clock } from '@/components/Clock';
import { Icon, type IconName } from '@/components/Icon';
import { CalendarWidget } from '@/components/CalendarWidget';
import { NowPlayingCard } from '@/components/NowPlayingCard';
import type { NowPlaying } from '@/lib/media';
import { HomeShell } from '@/components/HomeShell';
import { warningBanners } from '@/components/WarningBanners';
import { humidityWarnings, rainWarning } from '@/lib/alerts';
import { loadCommute, loadHistory, loadHome, loadTvStatus, loadNameDay, loadNet, loadNowPlaying, loadPrices, loadWarnings, loadWeather, loadWine } from '@/lib/data';
import { joinNames } from '@/lib/days';
import { compass } from '@/lib/home';
import { TONE_COLOR, commuteAlerts, direction, groupRoad, shortPlace, trainStatus, trainTone } from '@/lib/commute';
import { sumSeries } from '@/lib/history';
import { seenAgo, startOfDayStockholm } from '@/lib/time';
import { symbolInfo, weatherKind } from '@/lib/weather';
import { WeatherIcon } from '@/components/WeatherIcon';
import { hhmm, hourly, summarize } from '@/lib/prices';
import { fmtTemp, fmtWatt } from '@/lib/scale';

export const dynamic = 'force-dynamic';

// Hem enligt UX-riktlinjerna: tre zoner (Nu · Härnäst · Hemmet) på ett 12-kolumners rutnät, färg bara för status,
// avvikelser lyfts fram och det normala hålls dämpat. Bara visning, ingen styrning.

const C = { ok: '#3FB950', warn: '#E3A008', bad: '#F85149', mute: '#8B98A5' } as const;
const num = (v: number, d = 1) => v.toLocaleString('sv-SE', { maximumFractionDigits: d });
/** Rum utanför det här spannet räknas som avvikelse och lyfts fram. */
const COMFORT = { low: 18, high: 26 };

/** Kort: helt kort (#131A22), ingen gradient, samma inre marginal överallt. */
function Card({ title, icon, href, className = '', children }: { title?: string; icon?: IconName; href?: string; className?: string; children: React.ReactNode }) {
  const Box = href ? Link : 'section';
  return (
    <Box href={href!} className={`flex min-h-0 min-w-0 flex-col gap-3 overflow-hidden rounded-[20px] bg-card p-5 lg:p-6 ${className}`}>
      {title && (
        <h2 className="flex items-center gap-2.5 text-[18px] font-semibold text-dim">
          {icon && <Icon name={icon} size={22} />}
          {title}
        </h2>
      )}
      {children}
    </Box>
  );
}

/** Rad i Hemmet: etikett till vänster, värde till höger, högst en rad detalj under. */
function Row({ icon, label, value, detail, color, href, extra }: {
  icon: IconName; label: string; value: React.ReactNode; detail?: React.ReactNode; color?: string; href?: string; extra?: React.ReactNode;
}) {
  const Box = href ? (href.startsWith('http') ? 'a' : Link) : 'div';
  const ext = href?.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {};
  return (
    <Box href={href!} {...ext} className="flex h-[54px] min-w-0 shrink-0 items-center gap-3 border-b border-line last:border-b-0">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-white/[0.06]"><Icon name={icon} size={24} /></span>
      <span className="flex min-w-0 grow flex-col leading-tight">
        <span className="truncate text-[17px] font-semibold text-fg">{label}</span>
        {detail && <span className="truncate text-[16px] text-dim">{detail}</span>}
      </span>
      {extra}
      <span className="shrink-0 text-right text-[30px] leading-none font-bold tracking-tight tabular-nums" style={{ color }}>{value}</span>
      {href && <span className="shrink-0 text-[22px] text-dim" aria-hidden="true">›</span>}
    </Box>
  );
}

/** Liten linje för effektens senaste timmar. */
function Sparkline({ points }: { points: [number, number][] }) {
  if (points.length < 2) return null;
  const xs = points.map((p) => p[0]); const ys = points.map((p) => p[1]);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)]; const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const d = points.map(([x, y], i) => `${i ? 'L' : 'M'}${((x - x0) / (x1 - x0 || 1)) * 100},${28 - ((y - y0) / (y1 - y0 || 1)) * 26}`).join(' ');
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="hidden h-7 w-11 shrink-0 sm:block" aria-hidden="true">
      <path d={d} fill="none" stroke={C.mute} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default async function HomePage() {
  const [h, prices, weather, nameDay, castPlaying, net, wine, commute, powerHist, energyHist] = await Promise.all([
    loadHome(), loadPrices(), loadWeather(), loadNameDay(), loadNowPlaying(), loadNet(), loadWine(), loadCommute(),
    loadHistory('power', '12h').catch(() => []), loadHistory('energy', '24h').catch(() => []),
  ]);
  // TV: ADB-agentens status (vad som spelas i apparna) går före Homeys cast-data.
  const tvs2 = await loadTvStatus().catch(() => null);
  const wx = await loadWarnings(weather);
  const tvAgent: NowPlaying | null = tvs2?.is_on && tvs2.app_name && tvs2.media_status !== 'none'
    ? { id: tvs2.device_id, device: tvs2.app_name, kind: 'tv', playing: tvs2.media_status === 'playing',
        title: tvs2.media_title ?? tvs2.app_name, subtitle: [tvs2.media_artist, tvs2.media_status === 'paused' ? 'pausad' : null].filter(Boolean).join(' · ') || null }
    : null;
  const playing = tvAgent ? [tvAgent, ...castPlaying.filter((p) => p.kind !== 'tv')] : castPlaying;
  // TV på men inget spelas: visa appen (t.ex. "Netflix · startsida").
  const tvIdle = tvs2?.is_on && !tvAgent ? tvs2.app_name : null;
  const now = Date.now();
  const names = joinNames(nameDay);

  // ---- Nu: väder ----
  const tvs = commute?.station ?? null;
  const station = h.station ?? (tvs ? { wind: tvs.wind, gust: tvs.gust, dir: tvs.deg != null ? compass(tvs.deg) : null, road: tvs.road } : null);
  const smhiTemp = !h.outdoorStale && h.outdoorTemp == null && weather && Number.isFinite(weather.current.temp) ? Math.round(weather.current.temp * 10) / 10 : null;
  const outTemp = h.outdoorTemp ?? tvs?.air ?? smhiTemp;
  const sky = weather ? symbolInfo(weather.current.symbol) : null;

  // ---- Härnäst: pendling ----
  const dir = direction();
  const trains = commute?.[dir] ?? [];
  const roads = commute ? groupRoad(commute.road) : [];
  const trafficAlerts = commute ? commuteAlerts(commute, now, hhmm) : [];
  const hasCal = !!(process.env.CALENDAR_ICAL_URL || process.env.ULRIKA_ICAL_URL);

  // ---- Hemmet ----
  const tempRooms = h.rooms.filter((r) => r.temp != null);
  const tempAvg = tempRooms.length ? tempRooms.reduce((a, r) => a + r.temp!, 0) / tempRooms.length : null;
  const odd = tempRooms.filter((r) => r.temp! >= COMFORT.high || r.temp! < COMFORT.low).sort((a, b) => b.temp! - a.temp!);
  const open = h.openings.filter((o) => o.open);
  const price = summarize(prices, now);
  const hours = hourly(prices);
  const cheap = price.cheapest3h;
  const priceColor = price.level?.key === 'peak' ? C.bad : price.level?.key === 'high' ? C.warn : price.level?.key === 'cheap' ? C.ok : undefined;
  // Effekt: totalen de senaste 12 timmarna och förbrukning/kostnad sedan midnatt.
  const powerLine = powerHist.length ? sumSeries(powerHist, 'Effekt', C.mute).points.filter(([t]) => t * 1000 > now - 6 * 3600_000) : [];
  const dayStart = startOfDayStockholm(now) / 1000;
  const kwhToday = energyHist.flatMap((s) => s.points).filter(([t]) => t >= dayStart);
  const kwh = kwhToday.reduce((a, [, v]) => a + v, 0);
  const kr = kwhToday.reduce((a, [t, v]) => a + v * ((hours.find((p) => p.start <= t * 1000 && t * 1000 < p.end)?.ore ?? price.todayAvg) / 100), 0);

  // ---- Status: växer och får färg bara när något händer ----
  const rain = rainWarning(weather, h.openings);
  const damp = humidityWarnings(h.rooms);
  const banners = warningBanners(wx, 3);
  const issues = banners.length + trafficAlerts.length + (rain ? 1 : 0) + damp.length + (net?.state === 'down' ? 1 : 0);
  const roadNote = roads.length ? `Väg 56/E18: ${roads.length === 1 ? roads[0].type.toLowerCase() : `${roads.length} ärenden`}` : 'väg 56/E18 fri';
  const trainNote = commute?.trains ? (trains.some((t) => trainTone(t) !== 'ok') ? 'tåg med förseningar' : 'tågen i tid') : null;

  const people = [...h.people].sort((x, y) => Number(y.present) - Number(x.present));

  return (
    <HomeShell temp={outTemp != null ? fmtTemp(outTemp) : null} alarms={issues}>
      <div className="flex flex-col gap-4 lg:grid lg:h-[calc(100dvh-2rem)] lg:grid-cols-12 lg:grid-rows-[auto_minmax(0,1fr)_auto] lg:gap-6">
        {/* NU: klocka, datum, namnsdag (accentfärg bara här). */}
        <header className="order-1 flex items-end gap-4 lg:order-none lg:col-span-4 lg:flex-col lg:items-start lg:gap-1">
          <h1 className="sr-only">Hemma</h1>
          <Clock show="time" className="text-[76px] leading-[0.9] font-bold tracking-tight text-sun tabular-nums lg:text-[112px] xl:text-[120px]" />
          <span className="flex flex-col pb-1 leading-tight">
            <Clock show="date" className="text-[18px] font-semibold first-letter:uppercase" />
            {names && <span className="text-[16px] text-dim">Namnsdag <span className="text-sun">{names}</span></span>}
          </span>
        </header>

        {/* STATUS: närvaro och läget. Lugnt = dämpad rad; något händer = färgade rader. */}
        <section aria-label="Status" className="order-2 flex min-w-0 flex-col gap-3 lg:order-none lg:col-span-8 lg:self-end">
          {people.length > 0 && (
            <ul aria-label="Närvaro" className="flex flex-wrap items-center gap-x-5 gap-y-1 lg:justify-end">
              {people.map((p) => (
                <li key={p.id} className="flex items-center gap-2 text-[18px]" title={p.present ? `${p.name} är hemma` : `${p.name} är borta`}>
                  <span className="size-3 rounded-full" style={{ background: p.present ? C.ok : 'transparent', boxShadow: p.present ? undefined : `inset 0 0 0 2px ${C.mute}` }} />
                  <span className={p.present ? 'font-semibold' : 'text-dim'}>{p.name}</span>
                  {!p.present && p.since && <span className="text-[16px] text-dim">{seenAgo(p.since)}</span>}
                </li>
              ))}
            </ul>
          )}
          {issues > 0 ? (
            <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap">
              {banners}
              {trafficAlerts.slice(0, 2).map((a) => (
                <Link key={a.id} href="/pendling" role="alert" className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[14px] px-4 py-2 text-[16px] font-semibold" style={{ background: a.tone === 'bad' ? C.bad : C.warn, color: '#0B0F14' }}>
                  <Icon name={a.kind === 'train' ? 'train' : 'road'} size={22} /><span className="lg:truncate">{a.label}</span>
                </Link>
              ))}
              {net?.state === 'down' && (
                <Link href="/larm#natverk" role="alert" className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[14px] px-4 py-2 text-[16px] font-semibold text-white" style={{ background: C.bad }}>
                  <Icon name="wifi" size={22} /><span className="lg:truncate">Internet nere{net.isp ? ` · ${net.isp}` : ''}</span>
                </Link>
              )}
              {rain && (
                <Link href="/larm" role="alert" className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[14px] px-4 py-2 text-[16px] font-semibold" style={{ background: C.warn, color: '#0B0F14' }}>
                  <Icon name="rain" size={22} /><span className="lg:truncate">Regn kl {hhmm(rain.at)} – stäng {rain.windows.map((w) => w.name).join(', ')}</span>
                </Link>
              )}
              {damp.length > 0 && (
                <Link href="/larm#fukt" role="alert" className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[14px] px-4 py-2 text-[16px] font-semibold" style={{ background: C.warn, color: '#0B0F14' }}>
                  <Icon name="drop" size={22} /><span className="lg:truncate">Fukt {damp.map((r) => `${r.name} ${Math.round(r.humidity!)} %`).join(', ')}</span>
                </Link>
              )}
            </div>
          ) : (
            <Link href="/larm" className="flex min-w-0 items-center gap-2.5 text-[16px] text-dim lg:justify-end">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: C.ok }} />
              <span className="truncate">
                Inga varningar{trainNote ? ` · ${trainNote}` : ''}{commute ? ` · ${roadNote}` : ''}{net?.state === 'ok' ? ' · internet uppe' : ''}
              </span>
            </Link>
          )}
        </section>

        {/* NU: väder med timmar och 5 dygn sammanslaget. */}
        <Card title={`Ute${weather?.source ? ` · ${weather.source}` : ''}`} icon="thermo" className="order-4 lg:order-none lg:col-span-4 lg:row-span-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              {outTemp != null ? (
                <span className="text-[64px] leading-none font-bold tracking-tight tabular-nums lg:text-[72px]">{fmtTemp(outTemp)}<TrendArrow trend={h.outdoorTrend} /></span>
              ) : (
                <span className="text-[28px] font-semibold text-dim">{h.outdoorStale ? 'Stationen tyst i 4 tim' : 'Ej tillgänglig'}</span>
              )}
              {sky && weather && (
                <span className="text-[18px] font-semibold">
                  {weather.nextPrecip && weather.nextPrecip.time > weather.current.time
                    ? `${sky.label} · ${symbolInfo(weather.nextPrecip.symbol).label.toLowerCase()} ${hhmm(weather.nextPrecip.time)}`
                    : sky.label}
                </span>
              )}
              {station && (
                <span className="flex flex-wrap gap-x-4 text-[16px] text-dim">
                  {station.wind != null && <span className="flex items-center gap-1"><Icon name="wind" size={18} />{num(station.wind)}{station.gust != null && station.gust > station.wind ? `–${num(station.gust)}` : ''} m/s {station.dir ?? ''}</span>}
                  {station.road != null && (
                    <span className="flex items-center gap-1" style={{ color: station.road <= 0.5 ? C.bad : undefined }}>
                      <Icon name="road" size={18} />Väg {fmtTemp(station.road)}{station.road <= 0.5 ? ' halka' : ''}
                    </span>
                  )}
                </span>
              )}
            </div>
            {sky && weather && <WeatherIcon kind={weatherKind(weather.current.symbol)} size={96} label={sky.label} />}
          </div>
          {weather && (
            <ol aria-label="Kommande timmar" className="grid grid-cols-6 gap-1 border-y border-line py-2">
              {weather.hours.slice(1, 7).map((w) => (
                <li key={w.time} className="flex flex-col items-center">
                  <span className="text-[16px] text-dim tabular-nums">{hhmm(w.time).slice(0, 2)}</span>
                  <WeatherIcon kind={weatherKind(w.symbol)} size={30} label={symbolInfo(w.symbol).label} />
                  <span className="text-[17px] font-semibold tabular-nums">{Number.isFinite(w.temp) ? `${Math.round(w.temp)}°` : '–'}</span>
                </li>
              ))}
            </ol>
          )}
          {weather?.days && weather.days.length > 0 && (
            <ol aria-label="Kommande dagar" className="flex min-h-0 flex-col gap-0.5">
              {weather.days.slice(0, 5).map((d) => {
                const day = new Intl.DateTimeFormat('sv-SE', { weekday: 'short', timeZone: 'Europe/Stockholm' }).format(Date.parse(`${d.date}T12:00:00Z`)).replace('.', '');
                return (
                  <li key={d.date} className="flex h-7 items-center gap-3 text-[17px]">
                    <span className="w-10 text-dim capitalize">{day}</span>
                    <WeatherIcon kind={weatherKind(d.symbol)} size={28} label={symbolInfo(d.symbol).label} />
                    <span className="grow text-[16px] text-dim">{d.precip >= 0.5 ? `${num(d.precip)} mm` : ''}</span>
                    <span className="font-semibold tabular-nums">{Math.round(d.max)}°</span>
                    <span className="w-9 text-right text-dim tabular-nums">{Math.round(d.min)}°</span>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>

        {/* HÄRNÄST: pendling och kalender. */}
        <div className="contents lg:col-span-4 lg:flex lg:min-h-0 lg:flex-col lg:gap-6">
          {commute?.trains && (
            <Card title={`Pendling · ${dir === 'out' ? 'mot Stockholm' : 'mot Eskilstuna'}`} icon="train" href="/pendling" className="order-3 lg:order-none lg:shrink-0">
              {trains.length === 0 && <p className="text-[18px] text-dim">Inga tåg de närmaste timmarna</p>}
              <ul className="flex flex-col gap-2">
                {trains.slice(0, 3).map((t, i) => {
                  const tone = trainTone(t);
                  return (
                    <li key={t.id} className="flex items-center gap-3">
                      <span className={`font-bold tabular-nums ${i === 0 ? 'text-[44px] leading-none' : 'text-[24px]'} ${t.canceled ? 'line-through opacity-60' : ''}`}>{hhmm(t.canceled ? t.dep : t.est ?? t.dep)}</span>
                      <span className="min-w-0 grow truncate text-[16px] text-dim">{t.track ? `spår ${t.track}` : t.dest}</span>
                      <span className="shrink-0 text-[16px] font-semibold" style={{ color: tone === 'ok' ? C.mute : TONE_COLOR[tone] }}>{trainStatus(t).text}</span>
                    </li>
                  );
                })}
              </ul>
              <p className="flex items-center gap-2 text-[16px]" style={{ color: roads.some((g) => g.tone === 'bad') ? C.bad : roads.length ? C.warn : C.mute }}>
                <Icon name="road" size={20} />
                <span className="truncate">{roads.length === 0 ? 'Väg 56/E18: fritt' : roads.length === 1 ? `${roads[0].road}: ${roads[0].type.toLowerCase()} · ${roads[0].places.map(shortPlace)[0] ?? ''}` : `Väg 56/E18: ${roads.length} ärenden`}</span>
              </p>
            </Card>
          )}
          {commute && !commute.trains && (
            <Card title="Väg 56/E18 · Eskilstuna–Västerås" icon="road" href="/pendling" className="order-3 lg:order-none lg:shrink-0">
              {roads.length === 0 ? <p className="text-[24px] font-semibold" style={{ color: C.ok }}>Fritt</p> : (
                <ul className="flex flex-col gap-1.5">
                  {roads.slice(0, 3).map((g) => (
                    <li key={g.id} className="flex items-center gap-2 text-[16px]">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: TONE_COLOR[g.tone] }} />
                      <span className="font-semibold">{g.road} {g.type.toLowerCase()}</span>
                      <span className="truncate text-dim">{g.places.map(shortPlace)[0] ?? ''}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
          {hasCal && <div className="order-5 flex min-h-0 lg:order-none lg:grow"><CalendarWidget /></div>}
        </div>

        {/* HEMMET: kompakta rader, avvikelser i färg. */}
        <Card title="Hemmet" icon="home" className="order-6 lg:order-none lg:col-span-4">
          <div className="scroll-x flex min-h-0 flex-col overflow-y-auto">
            {tempAvg != null && (
              <Row
                icon="thermo" label="Inomhus" href="/rum"
                detail={odd.length ? (
                  <span className="font-semibold">
                    {odd.slice(0, 3).map((r, i) => (
                      <span key={r.id} style={{ color: r.temp! >= COMFORT.high + 2 || r.temp! < COMFORT.low - 2 ? C.bad : C.warn }}>{i ? ' · ' : ''}{r.name} {fmtTemp(r.temp)}</span>
                    ))}
                  </span>
                ) : `alla rum ${COMFORT.low}–${COMFORT.high}°`}
                value={fmtTemp(Math.round(tempAvg * 10) / 10)}
              />
            )}
            {h.openings.length > 0 && (
              <Row
                icon={open.length ? 'shieldAlert' : 'shield'} label="Dörrar & fönster" href="/larm#oppet"
                detail={open.length ? open.map((o) => o.name).join(', ') : undefined}
                value={open.length ? `${open.length} öppna` : 'Stängt'} color={open.length ? C.warn : C.ok}
              />
            )}
            {h.lightsTotal > 0 && <Row icon="bulb" label="Lampor" href="/rum" value={h.lightsOn} detail={`tända av ${h.lightsTotal}`} />}
            {h.powerMeters + h.powerEstimated > 0 && (
              <Row icon="bolt" label="Effekt" href="/energi?vy=forbrukning" value={fmtWatt(h.powerW)}
                detail={kwh > 0 ? `${num(kwh, 1)} kWh · ${num(kr, 0)} kr idag` : undefined}
                extra={<Sparkline points={powerLine} />}
              />
            )}
            {price.now && (
              <Row icon="money" label="Elpris" href="/energi?vy=pris" value={<>{Math.round(price.now.ore)}<span className="text-[16px]"> öre</span></>} color={priceColor}
                detail={cheap ? `Billigast ${hhmm(cheap.start).slice(0, 2)}–${hhmm(cheap.end).slice(0, 2)} · ${Math.round(cheap.ore)} öre` : undefined}
              />
            )}
            {wine && (
              <Row icon="wine" label="Vinkällaren" href="https://wine.trand.se" value={<>{wine.total}<span className="text-[16px] font-semibold"> fl</span></>}
                detail={['red', 'white', 'sparkling', 'rose'].filter((c) => wine.by_color[c]).map((c) => `${wine.by_color[c]} ${({ red: 'röda', white: 'vita', sparkling: 'bubbel', rose: 'rosé' } as Record<string, string>)[c]}`).join(' · ')}
              />
            )}
          </div>
        </Card>

        {/* TV och ljud: alltid samma plats längst ner (mitten + höger). Spelar något visas titeln, annars en lugn rad. */}
        <section aria-label="TV och ljud" className="order-7 grid grid-cols-1 gap-4 md:grid-cols-2 lg:order-none lg:col-span-8 lg:gap-6">
          {(['tv', 'music'] as const).map((kind) => {
            const p = playing.find((x) => x.kind === kind);
            return p ? <NowPlayingCard key={kind} p={p} /> : (
              <div key={kind} className="flex min-h-16 items-center gap-3 rounded-[20px] bg-card px-5 text-[17px] text-dim">
                <Icon name={kind === 'tv' ? 'tv' : 'music'} size={26} />
                <span className="font-semibold text-fg">{kind === 'tv' ? 'TV' : 'Högtalare'}</span>
                <span>· {kind === 'tv' ? (tvIdle ? `på · ${tvIdle}` : 'inget spelas') : 'tyst'}</span>
              </div>
            );
          })}
        </section>
      </div>
    </HomeShell>
  );
}
