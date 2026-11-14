import Link from 'next/link';
import { TrendArrow } from '@/components/TrendArrow';
import { Clock } from '@/components/Clock';
import { Icon, type IconName } from '@/components/Icon';
import { CalendarWidget } from '@/components/CalendarWidget';
import { NowPlayingStrip, type PlayingItem, type TvView } from '@/components/NowPlayingStrip';
import { MinutesTo } from '@/components/MinutesTo';
import { tvAppLabel } from '@/lib/media';
import { HomeShell } from '@/components/HomeShell';
import { AlertChips, type Alert } from '@/components/AlertChips';
import { weatherAlerts } from '@/components/WarningBanners';
import { humidityWarnings, rainWarning } from '@/lib/alerts';
import { loadCommute, loadHistory, loadHome, loadTvStatuses, loadNameDay, loadNet, loadNowPlaying, loadPrices, loadWarnings, loadWeather, loadWine } from '@/lib/data';
import { joinNames } from '@/lib/days';
import { compass } from '@/lib/home';
import { TONE_COLOR, commuteAlerts, direction, groupRoad, shortPlace, trainStatus, trainTone } from '@/lib/commute';
import { sumSeries } from '@/lib/history';
import { seenAgo, startOfDayStockholm } from '@/lib/time';
import { dayOf } from '@/lib/calendar-view';
import { symbolInfo, weatherKind } from '@/lib/weather';
import { WeatherIcon } from '@/components/WeatherIcon';
import { hhmm, hourly, summarize } from '@/lib/prices';
import { fmtTemp } from '@/lib/scale';

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

/**
 * Rad i Hemmet, samma upplägg överallt: ikon · rubrik med undertext · värde med enhet under.
 * Värdekolumnen har fast bredd och är högerjusterad, så att värdena står rakt under varandra.
 */
function Row({ icon, label, value, unit, detail, color, href, extra }: {
  icon: IconName; label: string; value: React.ReactNode; unit?: string; detail?: React.ReactNode; color?: string; href?: string; extra?: React.ReactNode;
}) {
  const Box = href ? (href.startsWith('http') ? 'a' : Link) : 'div';
  const ext = href?.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {};
  return (
    <Box href={href!} {...ext} className="flex h-[var(--row-h,60px)] min-w-0 shrink-0 lg:h-auto lg:max-h-[72px] lg:min-h-[var(--row-h,60px)] lg:flex-1 items-center gap-3 border-b border-line last:border-b-0">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-white/[0.06]"><Icon name={icon} size={24} /></span>
      <span className="flex min-w-0 grow flex-col gap-0.5 leading-tight">
        <span className="truncate text-[17px] font-semibold text-fg">{label}</span>
        {detail && <span className="truncate text-[16px] text-dim">{detail}</span>}
      </span>
      {extra}
      <span className="flex w-[92px] shrink-0 flex-col items-end leading-none">
        <span className="text-[30px] font-bold tracking-tight tabular-nums" style={{ color }}>{value}</span>
        {unit && <span className="mt-1 text-[14px] text-dim">{unit}</span>}
      </span>
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
  const tvRows = await loadTvStatuses().catch(() => []);
  const tvRaw = tvRows.find((r) => r.device_id !== 'the-frame') ?? null;
  // Råa appnamn översätts (t.ex. Playplus → Telia Play).
  const tvs2 = tvRaw ? { ...tvRaw, app_name: tvAppLabel(tvRaw.app_name) } : null;
  const frame = tvRows.find((r) => r.device_id === 'the-frame') ?? null;
  const wx = await loadWarnings(weather);
  // TV-rutan visar det som syns på skärmen, det senaste först:
  // - The Frame i konstläge eller avstängd: det gäller oavsett vad Google TV rapporterar.
  // - Annars den källa vars innehåll ändrades senast: en app direkt på The Frame (Tizen) eller Google TV.
  const changed = (r: { changed_at?: string; updated_at: string } | null) => (r ? Date.parse(r.changed_at ?? r.updated_at) : 0);
  const frameArt = frame?.app_name === 'Konstläge';
  const frameOff = !!frame && !frame.is_on && !frameArt;
  const frameApp = frame?.is_on && frame.current_app?.startsWith('tizen:') ? frame : null;
  const googleShows = !!tvs2?.is_on && !!tvs2.app_name && tvs2.media_status !== 'none';
  const useFrame = !!frameApp && (!googleShows || changed(frameApp) >= changed(tvs2));
  // TV-rutan: det som syns nu, i ett enhetligt format.
  const castTv = !frameArt && !frameOff ? castPlaying.find((p) => p.kind === 'tv') : undefined;
  const tvView: TvView = frameArt ? { source: 'Samsung TV', app: null, title: null, subtitle: null, status: 'art' }
    : frameOff ? { source: 'Samsung TV', app: null, title: null, subtitle: null, status: 'off' }
    : useFrame ? { source: 'Samsung TV', app: tvAppLabel(frameApp!.app_name), title: null, subtitle: null, status: 'playing' }
    : googleShows ? { source: 'Google TV', app: tvs2!.app_name, title: tvs2!.media_title, subtitle: tvs2!.media_artist, status: tvs2!.media_status === 'paused' ? 'paused' : 'playing' }
    : castTv ? { source: 'Google TV', app: null, title: castTv.title, subtitle: castTv.subtitle, status: 'playing' }
    : tvs2?.is_on ? { source: 'Google TV', app: tvs2.app_name, title: null, subtitle: null, status: 'on' }
    : frame?.is_on ? { source: 'Samsung TV', app: null, title: null, subtitle: null, status: 'on' }
    : { source: 'TV', app: null, title: null, subtitle: null, status: frame || tvs2 ? 'off' : 'unknown' };
  const speaker = castPlaying.find((p) => p.kind === 'music');
  // Spelas nu: TV och högtalare i samma rad överst (bara det som faktiskt spelar).
  const playing: PlayingItem[] = [];
  if (tvView.status === 'playing' || tvView.status === 'paused') {
    const t = tvView.title ?? tvView.app;
    playing.push({
      key: 'tv', kind: 'tv',
      label: tvView.title && tvView.app ? `${tvView.source} · ${tvView.app}` : tvView.source,
      title: t ?? 'Spelar', subtitle: tvView.title ? tvView.subtitle : null, paused: tvView.status === 'paused',
    });
  }
  if (speaker) playing.push({ key: 'music', kind: 'music', label: speaker.device, title: speaker.title, subtitle: speaker.subtitle ?? null });
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
  // Alla varningar i samma format; nivån (gul/orange/röd) styr bara färgen.
  const alerts: Alert[] = [
    ...weatherAlerts(wx),
    ...trafficAlerts.map((a): Alert => ({
      id: a.id, icon: a.kind === 'train' ? 'train' : 'road', text: a.label, href: '/pendling',
      level: a.kind === 'road' ? 'orange' : a.tone === 'bad' ? 'red' : 'yellow',
    })),
    ...(net?.state === 'down' ? [{ id: 'net', level: 'red', icon: 'wifi', text: `Internet nere${net.isp ? ` · ${net.isp}` : ''}`, href: '/larm#natverk' } as Alert] : []),
    ...(rain ? [{ id: 'rain', level: 'orange', icon: 'rain', text: `Regn kl ${hhmm(rain.at)} – stäng ${rain.windows.map((w) => w.name).join(', ')}`, href: '/larm' } as Alert] : []),
    ...(damp.length ? [{ id: 'damp', level: 'yellow', icon: 'drop', text: `Fukt ${damp.map((r) => `${r.name} ${Math.round(r.humidity!)} %`).join(', ')}`, href: '/larm#fukt' } as Alert] : []),
  ];
  const issues = alerts.length;
  const roadNote = roads.length ? `Väg 56/E18: ${roads.length === 1 ? roads[0].type.toLowerCase() : `${roads.length} ärenden`}` : 'väg 56/E18 fri';
  const trainNote = commute?.trains ? (trains.some((t) => trainTone(t) !== 'ok') ? 'tåg med förseningar' : 'tågen i tid') : null;

  // Antal rader i Hemmet: fler än sex ger lite lägre rader så att allt ryms på plattan.
  const rowCount = [tempAvg != null, h.openings.length > 0, !!net, h.lightsTotal > 0, h.powerMeters + h.powerEstimated > 0, !!price.now, !!wine].filter(Boolean).length;
  const people = [...h.people].sort((x, y) => Number(y.present) - Number(x.present));

  return (
    <HomeShell temp={outTemp != null ? fmtTemp(outTemp) : null} alarms={issues}>
      <div className="flex flex-col gap-4 md:grid md:grid-cols-2 md:items-start lg:h-[calc(100dvh-2rem)] lg:grid-cols-12 lg:grid-rows-[auto_minmax(0,1fr)] lg:items-stretch lg:gap-6">
        {/* NU: klocka, datum, namnsdag (accentfärg bara här). */}
        <header className="order-1 flex items-end gap-4 md:col-span-2 lg:order-none lg:col-span-4 lg:flex-col lg:items-start lg:gap-3">
          <h1 className="sr-only">Hemma</h1>
          <Clock show="time" className="text-[76px] leading-[0.9] font-bold tracking-tight text-sun tabular-nums lg:text-[88px] lg:leading-[0.75]" />
          <span className="flex flex-col pb-1 leading-tight">
            <Clock show="date" className="text-[18px] font-semibold first-letter:uppercase" />
            {names && <span className="text-[16px] text-dim">Namnsdag <span className="text-sun">{names}</span></span>}
          </span>
        </header>

        {/* STATUS: närvaro och läget. Lugnt = dämpad rad; något händer = färgade rader. */}
        <section aria-label="Status" className="order-2 flex min-w-0 flex-col gap-3 md:col-span-2 lg:order-none lg:col-span-8 lg:self-end">
          <NowPlayingStrip items={playing} />
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
            <AlertChips alerts={alerts} />
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
              {/* Fyra avgångar: lista i mobil, 2×2 på plattan så att kalendern under får plats. */}
              <ul className="grid grid-cols-1 gap-x-5 gap-y-2.5 lg:grid-cols-2">
                {trains.slice(0, 4).map((t) => {
                  const tone = trainTone(t);
                  return (
                    <li key={t.id} className="flex min-w-0 flex-col leading-tight">
                      <span className="flex items-baseline gap-2">
                        <span className={`text-[28px] font-bold tabular-nums ${t.canceled ? 'line-through opacity-60' : ''}`}>{hhmm(t.canceled ? t.dep : t.est ?? t.dep)}</span>
                        <span className="ml-auto shrink-0 text-[15px] font-semibold" style={{ color: tone === 'ok' ? C.mute : TONE_COLOR[tone] }}>{trainStatus(t).text}</span>
                      </span>
                      <span className="truncate text-[15px] text-dim">
                        {!t.canceled && (dayOf(t.dep) !== dayOf(now) ? <span className="font-semibold text-fg">imorgon</span> : <MinutesTo at={t.est ?? t.dep} className="font-semibold text-fg tabular-nums" />)}
                        {t.canceled ? '' : ' · '}{t.track ? `spår ${t.track}` : t.dest}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {/* Vägen: upp till två händelser i samma radformat som tågen (status till höger). */}
              <ul className="flex flex-col gap-1.5 border-t border-line pt-3">
                {roads.length === 0 && (
                  <li className="flex items-center gap-3 text-[16px]">
                    <Icon name="road" size={22} /><span className="grow text-dim">Väg 56/E18</span>
                    <span className="font-semibold" style={{ color: C.ok }}>Fritt</span>
                  </li>
                )}
                {roads.slice(0, 2).map((g) => (
                  <li key={g.id} className="flex min-w-0 items-center gap-3">
                    <Icon name="road" size={22} />
                    <span className="flex min-w-0 grow flex-col leading-tight">
                      <span className="truncate text-[16px] font-semibold">{g.road} · {g.type}{g.count > 1 ? ` ×${g.count}` : ''}</span>
                      <span className="truncate text-[16px] text-dim">{g.places.map(shortPlace).filter(Boolean)[0] ?? ''}</span>
                    </span>
                    <span className="shrink-0 text-[16px] font-semibold" style={{ color: TONE_COLOR[g.tone] }}>
                      {g.tone === 'bad' ? 'Stor påverkan' : g.tone === 'warn' ? 'Påverkan' : 'Liten'}
                    </span>
                  </li>
                ))}
                {roads.length > 2 && <li className="pl-[34px] text-[16px] text-dim">+ {roads.length - 2} till</li>}
              </ul>
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
          {hasCal && <div className="order-5 flex min-h-0 lg:order-none lg:min-h-[130px] lg:grow"><CalendarWidget /></div>}
        </div>

        {/* HEMMET: kompakta rader, avvikelser i färg. */}
        <Card className="order-6 lg:order-none lg:col-span-4 lg:py-3">
          <h2 className="sr-only">Hemmet</h2>
          <div className="scroll-x flex min-h-0 flex-col overflow-y-auto lg:grow" style={{ '--row-h': rowCount > 6 ? '51px' : '58px' } as React.CSSProperties}>
            {tempAvg != null && (
              <Row
                icon="thermo" label="Inomhus" href="/temperatur" value={num(Math.round(tempAvg * 10) / 10)} unit="°C snitt"
                detail={odd.length ? (
                  <span className="font-semibold">
                    {odd.slice(0, 3).map((r, i) => (
                      <span key={r.id} style={{ color: r.temp! >= COMFORT.high + 2 || r.temp! < COMFORT.low - 2 ? C.bad : C.warn }}>{i ? ' · ' : ''}{r.name} {fmtTemp(r.temp)}</span>
                    ))}
                  </span>
                ) : `Alla rum ${COMFORT.low}–${COMFORT.high}°`}
              />
            )}
            {h.openings.length > 0 && (
              <Row
                icon={open.length ? 'shieldAlert' : 'shield'} label="Dörrar & fönster" href="/larm#oppet"
                detail={open.length ? open.map((o) => o.name).join(', ') : 'Alla stängda'}
                value={open.length} unit="öppna" color={open.length ? C.warn : C.ok}
              />
            )}
            {net && (
              <Row
                icon="wifi" label="Internet" href="/larm#natverk"
                value={net.state === 'down' ? 'Nere' : net.latency != null ? Math.round(net.latency) : '–'}
                unit={net.state === 'down' ? undefined : 'ms svarstid'}
                color={net.state === 'down' ? C.bad : net.state === 'slow' ? C.warn : net.state === 'ok' ? C.ok : undefined}
                detail={[
                  net.state === 'unknown' ? 'Status okänd' : net.state === 'slow' ? 'Långsamt' : null,
                  net.downMbit != null ? `↓ ${Math.round(net.downMbit)} / ↑ ${Math.round(net.upMbit ?? 0)} Mbit` : null,
                  net.isp,
                ].filter(Boolean).join(' · ') || undefined}
              />
            )}
            {h.lightsTotal > 0 && <Row icon="bulb" label="Lampor" href="/lampor" value={h.lightsOn} unit="tända" detail={`av ${h.lightsTotal} lampor`} />}
            {h.powerMeters + h.powerEstimated > 0 && (
              <Row icon="bolt" label="Effekt" href="/energi?vy=forbrukning"
                value={h.powerW >= 1000 ? num(h.powerW / 1000, 2) : num(h.powerW, h.powerW < 100 ? 1 : 0)} unit={h.powerW >= 1000 ? 'kW' : 'W'}
                detail={kwh > 0 ? `${num(kwh, 1)} kWh · ${num(kr, 0)} kr idag` : 'Just nu'}
                extra={<Sparkline points={powerLine} />}
              />
            )}
            {price.now && (
              <Row icon="money" label="Elpris" href="/energi?vy=pris" value={Math.round(price.now.ore)} unit="öre/kWh" color={priceColor}
                detail={cheap ? `Billigast ${hhmm(cheap.start).slice(0, 2)}–${hhmm(cheap.end).slice(0, 2)} · ${Math.round(cheap.ore)} öre` : price.level?.label}
              />
            )}
            {wine && (
              <Row icon="wine" label="Vinkällaren" href="https://wine.trand.se" value={wine.total} unit="flaskor"
                detail={['red', 'white', 'sparkling', 'rose'].filter((c) => wine.by_color[c]).map((c) => `${wine.by_color[c]} ${({ red: 'röda', white: 'vita', sparkling: 'bubbel', rose: 'rosé' } as Record<string, string>)[c]}`).join(' · ')}
              />
            )}
          </div>
        </Card>

      </div>
    </HomeShell>
  );
}
