import Link from 'next/link';
import { TrendArrow } from '@/components/TrendArrow';
import { Clock } from '@/components/Clock';
import { Icon, type IconName } from '@/components/Icon';
import { CalendarWidget } from '@/components/CalendarWidget';
import { ActionTiles, type Action } from '@/components/ActionTiles';
import { alongRoute, boxFor, isWeekend, km, placeLabel, stockholm, nearHome, nextTrip, upcoming, type Trip } from '@/lib/trip';
import { guessPlace } from '@/lib/place-guess';
import { etaConfigured, routeEta, type Eta } from '@/lib/route';
import { goalEta, origin } from '@/lib/goal';
import { journeyFor, loadOnward, loadTransit, transitConfigured, transitGoal } from '@/lib/transit-source';
import { TransitLegs, tripDelay } from '@/components/TransitTrip';
import type { TransitLeg } from '@/lib/transit';
import { HourStrip } from '@/components/HourStrip';
import { PingPhoneButton } from '@/components/PingPhoneButton';
import { pingableNames } from '@/app/actions/ping';
import { allPositions, earliestAt, freshestPosition, inferTrain, pickRun, positionDevices, TERMINALS } from '@/lib/onboard';
import { detectTrain, loadConfirmed, positionHistory } from '@/lib/onboard-source';
import { RoadImpact } from '@/components/RoadImpact';
import { calendarConfigured, loadCalendarServer } from '@/lib/calendar-source';
import { mirrorConfigured, mirrorTitle } from '@/lib/calendar-mirror';
import { policeAlerts } from '@/lib/police';
import { whereText } from '@/lib/locate';
import { NowPlayingStrip, type PlayingItem, type TvView } from '@/components/NowPlayingStrip';
import { OnTrainButton } from '@/components/OnTrainButton';
import { loadTrips, ticket } from '@/lib/trips-source';
import { claimAt, claimable, compensation } from '@/lib/trips';
import { TrainProgress, TrainRoute } from '@/components/TrainProgress';
import { HomeTrains, RiddenTrain } from '@/components/TrainFocus';
import { tvAppLabel } from '@/lib/media';
import { HomeShell } from '@/components/HomeShell';
import { AlertChips, type Alert } from '@/components/AlertChips';
import { weatherAlerts } from '@/components/WarningBanners';
import { humidityWarnings, rainWarning } from '@/lib/alerts';
import { geocode, loadArea, loadCommute, loadLocate, loadMunicipal, loadPolice, loadFlows, PLACE, loadHistory, loadHome, loadTvStatuses, loadNameDay, loadNet, loadNowPlaying, loadPrices, loadWarnings, loadWeather, loadWine } from '@/lib/data';
import { joinNames } from '@/lib/days';
import { compass } from '@/lib/home';
import { type RoadGroup, commuteAlerts, direction, groupRoad, shortPlace, slip, trainTone } from '@/lib/commute';
import { sumSeries } from '@/lib/history';
import { seenAgo, startOfDayStockholm } from '@/lib/time';
import { addDays, dayInfo, dayOf } from '@/lib/calendar-view';
import { zoned } from '@/lib/calendar';
import { symbolInfo, weatherKind } from '@/lib/weather';
import { WeatherIcon } from '@/components/WeatherIcon';
import { hhmm, hourly, summarize, VAT, fixedPriceOre } from '@/lib/prices';
import { fmtTemp } from '@/lib/scale';

export const dynamic = 'force-dynamic';

// Hem enligt UX-riktlinjerna: tre zoner (Nu · Härnäst · Hemmet) på ett 12-kolumners rutnät, färg bara för status,
// avvikelser lyfts fram och det normala hålls dämpat. Bara visning, ingen styrning.

const C = { ok: '#3FB950', warn: '#E3A008', bad: '#F85149', mute: '#8B98A5' } as const;
const num = (v: number, d = 1) => v.toLocaleString('sv-SE', { maximumFractionDigits: d });
/** Rum utanför det här spannet räknas som avvikelse och lyfts fram. */
const COMFORT = { low: 18, high: 26 };
/** Antal med rätt böjning: plural(1, 'minut', 'minuter') → "1 minut". */
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Pendling/helgtrafik: höjd efter innehåll men högst halva kolumnen; kalendern tar resten. */
const COMMUTE_H = 'lg:max-h-[calc(50%-0.75rem)]';

/** Kort: helt kort (#131A22), ingen gradient, samma inre marginal överallt. */
/**
 * Kort på Hem. Med href blir hela kortet en länk: pilen › visar det (WCAG 2.4.4), och `label` ger skärmläsare ett kort
 * namn i stället för kortets hela text.
 */
function Card({ title, icon, href, label, className = '', children }: { title?: React.ReactNode; icon?: IconName; href?: string; label?: string; className?: string; children: React.ReactNode }) {
  const Box = href ? Link : 'section';
  return (
    <Box href={href!} aria-label={href ? label : undefined} className={`flex min-h-0 min-w-0 flex-col gap-3 overflow-hidden rounded-[1.25rem] bg-card p-5 lg:p-6 ${className}`}>
      {title && (
        <h2 className="flex items-center gap-2.5 text-[1.125rem] font-semibold text-dim">
          {icon && <Icon name={icon} size={22} />}
          {title}
          {href && <span aria-hidden="true" className="ml-auto pl-2 text-[1.25rem] leading-none">›</span>}
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
    <Box href={href!} {...ext} className="flex h-[var(--row-h,3.75rem)] min-w-0 shrink-0 lg:h-[4.25rem] cols2:h-auto cols2:min-h-[4.25rem] cols2:lg:h-auto cols2:py-2 items-center gap-3 border-b border-line last:border-b-0">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-[0.75rem] bg-white/[0.06]"><Icon name={icon} size={24} /></span>
      <span className="flex min-w-0 grow flex-col gap-0.5 leading-tight">
        <span className="truncate text-[1.0625rem] font-semibold text-fg">{label}</span>
        {detail && <span className="truncate text-[1rem] text-dim">{detail}</span>}
      </span>
      {extra}
      <span className="flex w-[5.75rem] shrink-0 flex-col items-end leading-none">
        <span className="text-[1.875rem] font-bold tracking-tight tabular-nums" style={{ color }}>{value}</span>
        {unit && <span className="mt-1 text-[0.875rem] text-dim">{unit}</span>}
      </span>
      {href && <span className="shrink-0 text-[1.375rem] text-dim" aria-hidden="true">›</span>}
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
  // Snabbval = favoriterna i Homey: favoritflows och favoritmoods (stjärnmärkta i Homey-appen), i bokstavsordning.
  const flows = await loadFlows().catch(() => []);
  const pingable = await pingableNames();
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'sv');
  const quick: Action[] = [
    ...flows.map((f) => ({ id: f.id, name: f.name.trim(), kind: 'flow' as const, advanced: f.advanced })),
    ...h.favoriteMoods.map((m) => ({ id: m.id, name: m.name.trim(), kind: 'mood' as const })),
  ].sort(byName);
  // Förval först (QUICK_SCENES), t.ex. "Släck alla lampor=*:slack;Mys vardagsrum=Vardagsrum:mys".
  // Rum anges med namn, * = alla rum. Scen: ljust, mys eller slack.
  quick.unshift(...(process.env.QUICK_SCENES ?? '').split(';').flatMap((entry, i): Action[] => {
    const m = entry.match(/^\s*([^=]+?)\s*=\s*([^:]+?)\s*:\s*(ljust|mys|slack)\s*$/);
    if (!m) return [];
    const zones = m[2] === '*' ? h.rooms.map((r) => r.id) : h.rooms.filter((r) => r.name.toLowerCase() === m[2].toLowerCase()).map((r) => r.id);
    return zones.length ? [{ id: `preset-${i}`, name: m[1], kind: 'room', zones, scene: m[3] }] : [];
  }));
  // TV: ADB-agentens status (vad som spelas i apparna) går före Homeys cast-data.
  const tvRows = await loadTvStatuses().catch(() => []);
  const tvRaw = tvRows.find((r) => r.device_id !== 'the-frame') ?? null;
  // Råa appnamn översätts (t.ex. Playplus → Telia Play).
  const tvs2 = tvRaw ? { ...tvRaw, app_name: tvAppLabel(tvRaw.app_name) } : null;
  const frame = tvRows.find((r) => r.device_id === 'the-frame') ?? null;
  const [wx, police, locate, muni] = await Promise.all([loadWarnings(weather), loadPolice().catch(() => []), loadLocate().catch(() => ({ members: [], items: [] })), loadMunicipal().catch(() => [])]);
  // Life360 berikar närvaron: var den som är borta befinner sig (plats, "kör 70 km/h" eller gatan).
  // Avstånd hemifrån (fågelväg) för den som är borta enligt Life360; under 1 km visas inte.
  const awayKm = (m: { lat: number | null; lon: number | null }) => {
    if (m.lat == null || m.lon == null) return null;
    const d = km(PLACE, { lat: m.lat, lon: m.lon });
    return d >= 1 ? `${d < 10 ? num(d, 1) : Math.round(d)} km` : null;
  };
  const where = (name: string) => locate.members.find((m) => m.first.toLowerCase() === name.split(/\s+/)[0].toLowerCase());
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
  // Trafikverkets API direkt först (färskast); Homey-appens station som reserv.
  const station = (tvs ? { wind: tvs.wind, gust: tvs.gust, dir: tvs.deg != null ? compass(tvs.deg) : null, road: tvs.road } : null) ?? h.station;
  const smhiTemp = tvs?.air == null && h.outdoorTemp == null && weather && Number.isFinite(weather.current.temp) ? Math.round(weather.current.temp * 10) / 10 : null;
  const outTemp = tvs?.air ?? h.outdoorTemp ?? smhiTemp;
  const sky = weather ? symbolInfo(weather.current.symbol) : null;
  // Källan för temperaturen som visas (inte prognosens): Trafikverket direkt, Homey-stationen eller prognosen.
  const outSource = tvs?.air != null ? `Trafikverket · ${tvs.name}` : h.outdoorTemp != null ? h.outdoorSource : weather?.source ?? null;
  // Vad vädret betyder för hemmet (en rad, bara när det är relevant).
  const nightMin = weather ? Math.min(...weather.hours.slice(0, 12).map((x) => x.temp).filter(Number.isFinite)) : Infinity;
  // Halka hemma: Trafikverkets stationer nära hemmet (med fukt/daggpunkt), annars Homey-stationens vägtemperatur.
  const homeSlip = tvs ? slip(tvs) : station?.road != null ? slip({ name: '', air: null, road: station.road, wind: null, gust: null, deg: null, at: 0 }) : null;
  const slipColor = homeSlip === 'bad' ? C.bad : homeSlip === 'warn' ? C.warn : undefined;
  const hint: { icon: IconName; text: string } | null =
    homeSlip === 'bad' ? { icon: 'road', text: 'Halt ute – skrapa bilen' }
    : homeSlip === 'warn' ? { icon: 'road', text: `Risk för halka – vägbanan ${fmtTemp(station!.road!)}` }
    : station?.gust != null && station.gust >= 12 ? { icon: 'wind', text: `Byiga vindar ${num(station.gust, 0)} m/s – säkra utemöblerna` }
    : outTemp != null && outTemp > 0 && nightMin <= 0 ? { icon: 'snow', text: `Frost inatt (${num(nightMin, 0)}°)` }
    : null;

  // ---- Härnäst: pendling ----
  const dir = direction();
  // Söndag: bara måndagens tåg från 06:00 på Hem (alla avgångar finns under Pendling).
  const sunday = stockholm(now).day === 0;
  const monday6 = sunday ? (([y, m, d]) => zoned(y, m, d, 6, 0, 0))(addDays(dayOf(now), 1).split('-').map(Number)) : 0;
  // Tåg man inte hinner till härifrån (snabbaste vägen, taxi/cykel) visas inte – då håller inte planen.
  const reachBy = commute?.trains ? earliestAt(freshestPosition(locate.members, locate.items, process.env.HOUSEHOLD ?? '', now), TERMINALS[dir === 'out' ? 0 : 1], now) : null;
  const trains = (commute?.[dir] ?? []).filter((t) => (!sunday || t.dep >= monday6) && (reachBy == null || (t.est ?? t.dep) >= reachBy));
  const roads = commute ? groupRoad(commute.road) : [];
  const trafficAlerts = commute ? commuteAlerts(commute, now, hhmm) : [];
  const hasCal = calendarConfigured();
  const hasMirror = mirrorConfigured();
  // Helg: ingen tågpendling. Visa i stället vägläget mot nästa kalenderhändelse med plats (t.ex. Mariefred),
  // annars trafikläget i närområdet. Samma kortstorlek som pendlingen.
  const weekend = !!commute?.trains && isWeekend(now);
  let trip: (Trip & { km: number }) | null = null;
  let weekendRoads: RoadGroup[] = [];
  if (weekend) {
    const cal = hasCal ? await loadCalendarServer().catch(() => null) : null;
    const t = cal ? nextTrip(cal.days, now) : null;
    const dest = t ? await geocode(t.location) : null;
    const dist = dest ? km(PLACE, dest) : 0;
    if (t && dest && dist > 3 && dist < 250) {
      trip = { ...t, km: dist };
      weekendRoads = groupRoad(alongRoute(await loadArea(boxFor([PLACE, dest], 8)), PLACE, dest), now);
    } else {
      weekendRoads = groupRoad(nearHome(await loadArea(boxFor([PLACE], 20)), PLACE), now);
    }
  }

  // Nästa resa: kalenderhändelse med adress inom 8 h. TomTom räknar restid med trafik och när man bör åka.
  // Startpunkt: hemmet, eller dashboardens person (HOUSEHOLD = förnamnet i Life360) om hen är borta.
  // Utan kalenderhändelse: DEFAULT_DESTINATION (adress eller "lat,lon", t.ex. Ulrikas jobb) på arbetsdagar 05–12,
  // om hen inte redan är där. Rubrik i DEFAULT_DESTINATION_LABEL (standard "Jobbet").
  // Plats: kalenderns platsfält, annars gissad ur titeln (TomTom Search, t.ex. "Tunahallen W fotboll"). Minst 1 km bort.
  // Marginal: 5 min, och 15 min när bilresan tar minst 30 min.
  let tripEta: { trip: Trip & { km: number }; eta: Eta; fromHere: boolean; fallback: boolean; guessed: boolean; margin: number } | null = null;
  if (etaConfigured()) {
    const o = origin(locate.members);
    const cal = hasCal ? await loadCalendarServer().catch(() => null) : null;
    for (const e of cal ? upcoming(cal.days, now).slice(0, 3) : []) {
      const guess = e.location ? null : await guessPlace(e.title, PLACE);
      const dest = e.location ? (await geocode(e.location)) ?? (await guessPlace(e.location, PLACE))?.at ?? null : guess?.at ?? null;
      const dist = dest ? km(PLACE, dest) : 0;
      if (!dest || dist <= 1 || dist >= 400) continue;
      const first = await routeEta(o.from, dest, e.start - 5 * 60_000, now);
      if (!first) break;
      const margin = first.minutes >= 30 ? 15 : 5;
      const eta = margin === 15 ? { ...first, depart: first.depart - 10 * 60_000 } : first;
      const place = e.location ? placeLabel(e.location) : `${guess!.name}?`;
      tripEta = { trip: { title: e.title, location: e.location ?? guess!.name, place, start: e.start, km: dist }, eta, fromHere: o.away, fallback: false, guessed: !e.location, margin };
      break;
    }
  }
  // Restid till standardmålet (DEFAULT_DESTINATION, t.ex. Ulrikas jobb) i vägkortet, som på Trafik.
  const homeGoal = etaConfigured() && process.env.DEFAULT_DESTINATION && commute && !commute.trains ? await goalEta(locate.members, now) : null;
  // Kollektivt till jobbet (ResRobot) på väg mot Stockholm en arbetsdag: nästa resa i pendlingskortet.
  // Mot Stockholm: till jobbet hemifrån. Mot Eskilstuna: hem från positionen (Life360), annars från jobbet.
  const tg = transitConfigured() && commute?.trains && !weekend && !dayInfo(dayOf(now), now).free ? transitGoal() : null;
  const o2 = tg ? origin(locate.members) : null;
  let nextTransit: Awaited<ReturnType<typeof loadTransit>>[number] | null = null;
  const transitHome = !!tg && dir === 'home';
  if (tg && o2) {
    const atGoal = !!o2.pos && km(o2.pos, tg.at) <= 1;
    const elsewhere = o2.away && !atGoal;
    // Hemifrån/från jobbet: resan runt nästa tåg (visas tills tåget gått, även om man är sen). Annars snabbaste härifrån.
    const next = trains.find((t) => !t.canceled && (t.est ?? t.dep) > now);
    const viaPref = !!process.env.TRANSIT_VIA && !!process.env.TRANSIT_TRANSFER;
    if (viaPref && next && !elsewhere && (transitHome ? atGoal || !o2.pos : !atGoal)) {
      const j = await journeyFor(next, !transitHome, PLACE);
      if (j) nextTransit = { dep: j.leave, arr: j.arrive, legs: j.legs, startAt: null, endAt: null };
    } else {
      if (!transitHome && !atGoal) nextTransit = (await loadTransit(o2.from, tg.at, now, 1, !o2.away))[0] ?? null;
      if (transitHome && (o2.away || !o2.pos)) nextTransit = (await loadTransit(o2.away ? o2.pos! : tg.at, PLACE, now, 1, false, true))[0] ?? null;
    }
  }
  const transitLate = nextTransit && commute ? tripDelay(nextTransit, [...commute.out, ...commute.home, ...commute.all]) : null;
  const leaveIn = nextTransit ? Math.round((nextTransit.dep - now) / 60_000) : 0;
  // Tågläge: sitter dashboardens person på ett tåg (Life360/Apple Watch mot tågens GPS) visar pendlingskortet bara det
  // tåget och resten av resan.
  const me = process.env.HOUSEHOLD ?? '';
  const dirTrains = commute ? [...commute[dir], ...(commute.recent?.[dir] ?? [])] : [];
  // Användarens bekräftelse ("Jag är på tåget") går före positionen.
  const confirmed = commute?.trains ? await loadConfirmed(now) : null;
  let onTrain = confirmed ? { train: confirmed.ident, dist: 0, src: 'user' as const } : commute?.trains ? await detectTrain(freshestPosition(locate.members, locate.items, me, now), now, new Set(dirTrains.map((t) => t.ident))) : null;
  // Ingen ny position sedan perrongen strax före en avgång: troligen på det tåget.
  const guessed = !onTrain && commute?.trains ? inferTrain([...allPositions(locate.members, locate.items, me, now, 2 * 3600_000), ...await positionHistory(positionDevices(locate.members, locate.items, me), now - 2 * 3600_000)], TERMINALS[dir === 'out' ? 0 : 1], dirTrains, now) : null;
  if (guessed) onTrain = { train: guessed, dist: 0, src: 'life360' };
  const allTrains = commute ? [...commute.out, ...commute.home, ...commute.all, ...(commute.recent?.out ?? []), ...(commute.recent?.home ?? [])] : [];
  const run = confirmed ? allTrains.find((t) => t.ident === confirmed.ident && t.dep === confirmed.dep) ?? pickRun(allTrains, confirmed.ident, now)
    : onTrain ? pickRun(allTrains, onTrain.train, now) : null;
  // Tågläget missade (ingen position): erbjud bekräftelse för tåget som just gått (högst 20 min sedan).
  const justLeft = !onTrain && commute ? [...(commute.recent?.[dir] ?? [])].filter((t) => !t.canceled && (t.est ?? t.dep) > now - 20 * 60_000).sort((a, b) => b.dep - a.dep)[0] ?? null : null;
  const riddenToWork = !!run && (!!commute?.out.some((t) => t.id === run.id) || !!commute?.recent?.out.some((t) => t.id === run.id));
  // Kommande avgångar inom en timme (minst nästa), som reserv om tågläget har fel.
  const upcomingDir = trains.filter((t) => !t.canceled && (t.est ?? t.dep) > now && t.ident !== run?.ident);
  const nextHour = upcomingDir.filter((t) => (t.est ?? t.dep) <= now + 3600_000).length ? upcomingDir.filter((t) => (t.est ?? t.dep) <= now + 3600_000) : upcomingDir.slice(0, 1);
  const riddenArr = run?.arr != null ? run.arr + (run.delay ?? 0) * 60_000 : null;
  const onward = run && riddenArr && (riddenToWork || [...(commute?.home ?? []), ...(commute?.recent?.home ?? [])].some((t) => t.id === run.id)) ? await loadOnward(riddenArr, riddenToWork, PLACE) : [];
  // Hela resan i tågläget: tågsträckan (pågår nu) och resten efter tåget.
  const tripLegs: TransitLeg[] = run && riddenArr ? [{
    kind: 'train', from: riddenToWork ? 'Eskilstuna C' : 'Stockholm C', to: riddenToWork ? 'Stockholm C' : 'Eskilstuna C',
    dep: run.est ?? run.dep, arr: riddenArr, minutes: Math.round((riddenArr - (run.est ?? run.dep)) / 60_000),
    label: `${run.product ?? 'Tåg'} ${run.ident}`, num: run.ident, dir: run.dest, track: null,
  }, ...onward] : [];
  // Efter ankomsten pågår resan till sista delsträckan är klar (byte i Stockholm C, promenad hem).
  const arrived = riddenArr != null && now > riddenArr;
  // Framme (positionen vid jobbet eller hemma, högst 10 min gammal): tillbaka till normalläget.
  const here = freshestPosition(locate.members, locate.items, me, now);
  const goalAt = riddenToWork ? transitGoal()?.at : PLACE;
  const atGoal = !!here && !!goalAt && km(here.at, goalAt) < 0.4;
  const ridden = run && !atGoal && (!arrived || (onward.length > 0 && now <= onward.at(-1)!.arr + 5 * 60_000)) ? run : null;
  const tripEnd = onward.at(-1)?.arr;
  // Säkert på tåget (bekräftat eller tågets GPS, inte gissat): fokus på måltiden och resplanen, inget brus.
  const sure = !!ridden && (!!confirmed || (!!onTrain && !guessed));
  const goalTime = tripEnd ?? (riddenToWork ? riddenArr : ridden?.homeAt ?? riddenArr);
  // På jobbet före 12: avgångarna dit behövs inte, pendlingen tar liten plats tills hemresan visas.
  const work = transitGoal()?.at;
  const atWork = dir === 'out' && !ridden && !!here && !!work && km(here.at, work) < 0.4;
  const when = (ms: number) => (dayOf(ms) === dayOf(now) ? hhmm(ms) : `imorgon ${hhmm(ms)}`);
  const tripLine = tripEta && (() => {
    const { eta, trip: t } = tripEta;
    const goal = t.start != null ? t.start - tripEta.margin * 60_000 : null;
    const late = goal != null && eta.arrive > goal ? Math.round((eta.arrive - goal) / 60_000) : 0;
    const extra = `${eta.minutes} min${eta.trafficMin > 0 ? ` (+${eta.trafficMin} trafik)` : ''} + ${tripEta.margin} min marginal · ${Math.round(eta.km)} km${tripEta.fromHere ? ' härifrån' : ''}`;
    return eta.live
      ? <p className="text-[1rem]"><span className="font-semibold" style={{ color: late ? C.warn : C.ok }}>Åk nu · framme {hhmm(eta.arrive)}{late ? ` (${late} min sen)` : ''}</span> <span className="text-dim">· {extra}</span></p>
      : <p className="text-[1rem]"><span className="font-semibold">Åk senast {when(eta.depart)}</span> <span className="text-dim">· {extra}</span></p>;
  })();

  // ---- Hemmet ----
  const tempRooms = h.rooms.filter((r) => r.temp != null);
  const tempAvg = tempRooms.length ? tempRooms.reduce((a, r) => a + r.temp!, 0) / tempRooms.length : null;
  const odd = tempRooms.filter((r) => r.temp! >= COMFORT.high || r.temp! < COMFORT.low).sort((a, b) => b.temp! - a.temp!);
  const open = h.openings.filter((o) => o.open);
  const price = summarize(prices, now);
  const hours = hourly(prices);
  const cheap = price.cheapest3h;
  const fixed = fixedPriceOre();
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
  // Tågresor med försening att begära ersättning för (senaste 60 dagarna, Mälartåg).
  const openClaims = commute?.trains ? (await loadTrips().catch(() => [])).filter((t) => claimable(t) && t.claim === 'none' && claimAt(t) === 'mt' && t.dep > now - 60 * 86400_000) : [];
  const claimKr = openClaims.reduce((a, t) => a + (compensation(t, ticket()).kr ?? 0), 0);
  const alerts: Alert[] = [
    ...weatherAlerts(wx),
    // Halka hemma, om pendlingens halkvarning inte redan visas.
    ...(homeSlip && !trafficAlerts.some((a) => a.id.startsWith('halka-')) ? [{
      id: `halka-hem-${homeSlip}`, level: homeSlip === 'bad' ? 'red' : 'orange', icon: 'road', href: '/pendling',
      text: homeSlip === 'bad' ? 'Halt väglag hemma' : 'Halkrisk hemma', detail: `Vägtemperatur ${fmtTemp(station!.road!).replace('°', ' °C')}`,
    } as Alert] : []),
    ...trafficAlerts.filter((a) => !((weekend || sunday) && a.kind === 'train')).map((a): Alert => ({
      id: a.id, icon: a.kind === 'train' ? 'train' : 'road', text: a.title, detail: a.detail, href: '/pendling',
      level: a.tone === 'bad' ? 'red' : a.kind === 'road' ? 'orange' : 'yellow',
    })),
    ...(net?.state === 'down' ? [{ id: 'net', level: 'red', icon: 'wifi', text: 'Internet nere', detail: net.isp ?? undefined, href: '/larm#natverk' } as Alert] : []),
    ...(rain ? [{ id: 'rain', level: 'orange', icon: 'rain', text: `Regn kl ${hhmm(rain.at)}`, detail: `Stäng ${rain.windows.map((w) => w.name).join(', ')}`, href: '/larm' } as Alert] : []),
    // Polisen i närheten: allvarligt och färskt (senaste 3 h), högst en platta.
    ...policeAlerts(police, now).slice(0, 1).map((e): Alert => ({
      id: `polis-${e.id}`, level: e.level === 'red' ? 'red' : 'orange', icon: 'siren',
      text: e.type, detail: `${e.place} ${hhmm(e.at)}`, href: '/larm#narhet',
    })),
    // Kommunen: nytt ärende i ditt område (startat senaste 3 dygnen), högst en platta.
    ...muni.filter((m) => m.mine && m.start != null && m.start <= now && now - m.start < 3 * 86400_000).slice(0, 1).map((m): Alert => ({
      id: `kommun-${m.id}`, level: 'yellow', icon: 'roadwork', text: 'Kommunen informerar', detail: m.title, href: '/larm#kommunen',
    })),
    ...(openClaims.length ? [{
      id: `ersattning-${openClaims.length}`, level: 'yellow', icon: 'money', href: '/historik?m=train',
      text: 'Ersättning att söka', detail: `${openClaims.length === 1 ? '1 försenad resa' : `${openClaims.length} försenade resor`}${claimKr ? ` · ca ${claimKr} kr` : ''}`,
    } as Alert] : []),
    ...(damp.length ? [{ id: 'damp', level: 'yellow', icon: 'drop', text: 'Hög fukt', detail: damp.map((r) => `${r.name} ${Math.round(r.humidity!)} %`).join(', '), href: '/larm#fukt' } as Alert] : []),
  ];
  const issues = alerts.length;
  const roadNote = roads.length ? `Väg 56/E18: ${roads.length === 1 ? roads[0].type.toLowerCase() : `${roads.length} ärenden`}` : 'väg 56/E18 fri';
  const trainNote = commute?.trains ? (trains.some((t) => trainTone(t) !== 'ok') ? 'tåg med förseningar' : 'tågen i tid') : null;

  // Antal rader i Hemmet: fler än sex ger lite lägre rader så att allt ryms på plattan.
  const rowCount = [tempAvg != null, h.openings.length > 0, !!net, h.lightsTotal > 0, h.powerMeters + h.powerEstimated > 0, !!price.now, !!wine].filter(Boolean).length;
  // Närvaro: Homeys närvaroappar plus Life360-medlemmar som inte redan finns med (matchas på förnamn).
  const first = (n: string) => n.split(/\s+/)[0].toLowerCase();
  // Life360 går före Smart Presence: matchad person får Life360:s hemma/borta.
  const people = [
    ...h.people.map((p) => { const m = locate.members.find((x) => x.first.toLowerCase() === first(p.name)); return m ? { ...p, present: m.home, src: 'L360' } : { ...p, src: 'SP' }; }),
    ...locate.members.filter((m) => !h.people.some((p) => first(p.name) === m.first.toLowerCase()))
      .map((m) => ({ id: m.id, name: m.first, present: m.home, since: null as string | null, src: 'L360' })),
  ].sort((x, y) => Number(y.present) - Number(x.present));

  return (
    <HomeShell temp={outTemp != null ? fmtTemp(outTemp) : null} alarms={issues}>
      {/* Läge Stor (cols2): två kolumner – NU och HEMMET till vänster, HÄRNÄST till höger; sidan får scrolla. */}
      <div className="flex flex-col gap-4 md:grid md:grid-cols-2 md:items-start lg:h-[calc(100dvh-2rem)] lg:grid-cols-12 lg:grid-rows-[auto_minmax(0,1fr)] lg:items-stretch lg:gap-6 cols2:lg:h-auto cols2:lg:grid-cols-2 cols2:lg:grid-rows-[auto_auto_auto_1fr] cols2:lg:items-start">
        {/* NU: klocka, datum, namnsdag (accentfärg bara här). */}
        <header className="order-1 flex flex-wrap items-end gap-x-4 gap-y-1 md:col-span-2 lg:order-none lg:col-span-4 lg:flex-row lg:flex-wrap lg:items-end lg:gap-x-4 lg:gap-y-2 lg:self-start cols2:lg:col-span-1 cols2:lg:row-start-1 cols2:lg:flex-row cols2:lg:items-end">
          <h1 className="sr-only">Hemma</h1>
          <Clock show="time" className="text-[4.75rem] leading-[0.9] font-bold tracking-tight text-sun tabular-nums lg:text-[5.5rem] lg:leading-[0.75]" />
          <span className="flex flex-col pb-1 leading-tight">
            <Clock show="date" className="text-[1.125rem] font-semibold first-letter:uppercase" />
            {names && <span className="text-[1rem] text-dim">Namnsdag <span className="text-sun">{names}</span></span>}
          </span>
          {/* Spelar nu under klockan: fyller ytan och låter varningarna ligga högst upp i mitten. */}
          <div className="min-w-0 basis-full overflow-hidden lg:mt-1">
            <NowPlayingStrip items={playing} />
          </div>
        </header>

        {/* VARNINGAR (mitten): det brådskande överst och centralt. Korta rubriker; detaljerna finns på sidan bakom. */}
        <section aria-label="Varningar" className="order-2 flex min-w-0 flex-col gap-2 md:col-span-2 lg:order-none lg:col-span-4 lg:self-start 2xl:col-span-5 cols2:lg:col-span-2 cols2:2xl:col-span-2 cols2:lg:row-start-2">
          {issues > 0 ? (
            <AlertChips alerts={alerts} />
          ) : (
            <Link href="/larm" className="flex min-h-12 min-w-0 items-center gap-2.5 rounded-[0.875rem] px-1 text-[1rem] text-dim">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: C.ok }} />
              <span className="truncate">
                Inga varningar{trainNote ? ` · ${trainNote}` : ''}{commute ? ` · ${roadNote}` : ''}{net?.state === 'ok' ? ' · internet uppe' : ''}
              </span>
            </Link>
          )}
        </section>

        {/* NÄRVARO (höger, egen yta): vem är hemma, var de andra är. Källa (Life360/Smart Presence) visas på Hitta. */}
        {people.length > 0 && (
          <Link href="/hitta" aria-label="Närvaro – visa var alla är" className="order-2 min-w-0 md:col-span-2 lg:order-none lg:col-span-4 lg:self-start 2xl:col-span-3 cols2:lg:col-span-1 cols2:2xl:col-span-1 cols2:lg:col-start-2 cols2:lg:row-start-1">
            <ul aria-label="Närvaro" className="flex flex-wrap gap-x-5 gap-y-1.5 lg:flex-col lg:gap-1.5">
              {people.map((p) => {
                const m = !p.present ? where(p.name) : undefined;
                const w = m && !m.home ? [whereText(m), awayKm(m)].filter(Boolean).join(' · ') || null : null;
                const ago = !p.present && !w && p.since ? seenAgo(p.since) : null;
                return (
                  <li key={p.id} className="flex min-w-0 items-baseline gap-2 text-[1.125rem]" title={p.present ? `${p.name} är hemma` : `${p.name} är borta`}>
                    <span className="size-3 shrink-0 self-center rounded-full" style={{ background: p.present ? C.ok : 'transparent', boxShadow: p.present ? undefined : `inset 0 0 0 2px ${C.mute}` }} />
                    <span className={`shrink-0 ${p.present ? 'font-semibold' : 'text-dim'}`}>{p.name}</span>
                    {w && <span className="truncate text-[1rem] text-dim">{w}</span>}
                    {ago && <span className="truncate text-[0.9375rem] text-dim italic">{ago}</span>}
                  </li>
                );
              })}
            </ul>
          </Link>
        )}

        {/* NU (vänster): kompakt Ute med det som påverkar hemmet, och Snabbval under. */}
        <div className="contents lg:col-span-4 lg:flex lg:min-h-0 lg:flex-col lg:gap-6 cols2:lg:col-span-1 cols2:lg:col-start-1 cols2:lg:row-start-3">
          <Card title={`Ute${outSource ? ` · ${outSource}` : ''}`} icon="thermo" href="/vader"
            label={`Ute ${outTemp != null ? fmtTemp(outTemp) : ''}${sky ? `, ${sky.label.toLowerCase()}` : ''}${hint ? `. ${hint.text}` : ''}. Visa väderprognosen.`} className="order-4 lg:order-none lg:shrink-0">
            <div className="flex items-center gap-3">
              {sky && weather && <WeatherIcon kind={weatherKind(weather.current.symbol)} size={60} label={sky.label} />}
              <div className="flex min-w-0 grow flex-col">
                {outTemp != null ? (
                  <span className="text-[3rem] leading-none font-bold tracking-tight tabular-nums">{fmtTemp(outTemp)}<TrendArrow trend={h.outdoorTrend} /></span>
                ) : (
                  <span className="text-[1.25rem] font-semibold text-dim">{h.outdoorStale ? 'Stationen tyst' : 'Ej tillgänglig'}</span>
                )}
                {sky && weather && (
                  <span className="truncate text-[1rem] font-semibold">
                    {weather.nextPrecip && weather.nextPrecip.time > weather.current.time
                      ? `${sky.label} · ${symbolInfo(weather.nextPrecip.symbol).label.toLowerCase()} ${hhmm(weather.nextPrecip.time)}`
                      : sky.label}
                  </span>
                )}
              </div>
              {station?.wind != null && (
                <span className="flex shrink-0 flex-col items-end text-[0.9375rem] text-dim">
                  <span className="flex items-center gap-1"><Icon name="wind" size={16} />{num(station.wind, 0)}{station.gust != null && station.gust > station.wind ? `–${num(station.gust, 0)}` : ''} m/s</span>
                  {station.road != null && <span className={homeSlip ? 'font-semibold' : undefined} style={{ color: slipColor }}>{homeSlip ? '⚠ ' : ''}Väg {fmtTemp(station.road)}</span>}
                </span>
              )}
            </div>
            {weather && (
              <div className="border-t border-line pt-2"><HourStrip hours={weather.hours.slice(1, 13)} lat={PLACE.lat} lon={PLACE.lon} interactive={false} /></div>
            )}
            {/* Halka står redan i varningsraden: visa inte tipset dubbelt. */}
            {hint && !(hint.icon === 'road' && alerts.some((x) => x.id.startsWith('halka'))) && (
              <p className="flex items-center gap-2 text-[0.9375rem] font-semibold" style={{ color: C.warn }}>
                <Icon name={hint.icon} size={18} /><span className="truncate">{hint.text}</span>
              </p>
            )}
          </Card>

          {(quick.length > 0 || pingable.length > 0) && (
            <Card title="Snabbval" icon="star" className="order-3 lg:order-none lg:min-h-0">
              <div className="flex min-h-0 flex-col overflow-y-auto">
                <ActionTiles items={quick} layout="compact" />
              </div>
              {/* Hitta mobilen (Android via ntfy): larmar tills den stängs på telefonen. */}
              {pingable.map((n) => <PingPhoneButton key={n} first={n} label={`📱 Ringa ${n.charAt(0).toUpperCase() + n.slice(1)}s mobil`} className="w-full justify-center" />)}
            </Card>
          )}
        </div>

        {/* HÄRNÄST: pendling och kalender. */}
        <div className="contents lg:col-span-4 lg:flex lg:min-h-0 lg:flex-col lg:gap-6 2xl:col-span-5 cols2:lg:col-span-1 cols2:2xl:col-span-1 cols2:lg:col-start-2 cols2:lg:row-start-3 cols2:lg:row-span-2">
          {/* Nästa resa (TomTom), om helgkortet inte redan visar den. */}
          {tripEta && !(weekend && trip) && !sure && (
            <Card title={`Resa · ${tripEta.trip.place}`} icon="road" href="/pendling"
              label={`Resa till ${tripEta.trip.place.replace(/\?$/, ' (gissad plats)')}${tripEta.trip.start != null ? ` klockan ${hhmm(tripEta.trip.start)}` : ''}: ${tripEta.eta.live ? `åk nu, framme ${hhmm(tripEta.eta.arrive)}` : `åk senast ${hhmm(tripEta.eta.depart)}`}, ${plural(tripEta.eta.minutes, 'minut', 'minuter')} plus ${tripEta.margin} minuters marginal. Visa trafikläget.`} className="order-3 lg:order-none lg:shrink-0">
              <p className="truncate text-[1rem] text-dim">
                {tripEta.fallback
                  ? <>Ingen kalenderhändelse · {tripEta.trip.location.split(',')[0]}</>
                  : <><span className="font-semibold text-fg">{tripEta.trip.start != null ? when(tripEta.trip.start) : 'Idag'}</span> · {tripEta.trip.title}</>}
              </p>
              {tripLine}
            </Card>
          )}
          {weekend && (
            <Card title={trip ? `Trafik · mot ${trip.place}` : 'Trafik · närområdet'} icon="road" className={`order-3 lg:order-none lg:shrink-0 ${COMMUTE_H}`}>
              <p className="truncate text-[1rem] text-dim">
                {trip
                  ? <>{trip.start != null ? <span className="font-semibold text-fg">{dayOf(trip.start) === dayOf(now) ? hhmm(trip.start) : `imorgon ${hhmm(trip.start)}`}</span> : <span className="font-semibold text-fg">Idag</span>} · {trip.title} · {Math.round(trip.km)} km</>
                  : 'Vägar inom 2 mil hemifrån'}
              </p>
              {trip && tripLine}
              <ul className="flex flex-col gap-2 border-t border-line pt-3">
                {weekendRoads.length === 0 && (
                  <li className="flex items-center gap-3 text-[1.125rem]">
                    <Icon name="road" size={24} /><span className="grow text-dim">{trip ? 'Längs vägen' : 'I närområdet'}</span>
                    <span className="font-semibold" style={{ color: C.ok }}>Inga störningar</span>
                  </li>
                )}
                {weekendRoads.slice(0, 3).map((g) => (
                  <li key={g.id} className="flex min-w-0 items-center gap-3">
                    <Icon name="road" size={22} />
                    <span className="flex min-w-0 grow flex-col leading-tight">
                      <span className="truncate text-[1rem] font-semibold">{g.type} · {g.road.replace(/^Väg/, 'väg')}{g.count > 1 ? ` ×${g.count}` : ''}</span>
                      <span className="truncate text-[0.9375rem] text-dim">{g.places.map(shortPlace).filter(Boolean)[0] ?? ''}</span>
                    </span>
                    <RoadImpact tone={g.tone} className="text-[1rem]" />
                  </li>
                ))}
                {weekendRoads.length > 3 && <li className="pl-[2.125rem] text-[0.9375rem] text-dim">+ {weekendRoads.length - 3} till</li>}
              </ul>
            </Card>
          )}
          {commute?.trains && !weekend && atWork && (
            <Card title={<>Pendling<span className="ml-auto rounded-full bg-white/[0.08] px-3 py-1 text-[1.0625rem] font-bold text-fg">På jobbet</span></>} icon="train" href="/pendling"
              label="Du är på jobbet. Hemresan visas från klockan 12. Visa alla avgångar." className="order-3 lg:order-none lg:shrink-0">
              <p className="text-[1rem] text-dim">Hemresan visas från 12:00</p>
            </Card>
          )}
          {commute?.trains && !weekend && !atWork && (
            <Card title={ridden ? <>{arrived || sure ? (riddenToWork ? 'På väg till jobbet' : 'På väg hem') : guessed ? 'På tåget (troligen)' : 'På tåget'}<span className="ml-auto flex items-center gap-1.5 rounded-full bg-white/[0.08] px-3 py-1 text-[1.0625rem] font-bold text-fg">{arrived && tripEnd ? `framme ${hhmm(tripEnd)}` : `${ridden.product ?? 'Tåg'} ${ridden.ident}`}</span></> : <>Pendling<span className="ml-auto flex items-center gap-1.5 rounded-full bg-white/[0.08] px-3 py-1 text-[1.0625rem] font-bold text-fg"><span className="hidden sm:inline">{dir === 'out' ? 'Eskilstuna ' : 'Stockholm '}</span>{dir === 'out' ? '→ Stockholm' : '→ Eskilstuna'}</span></>} icon="train" href="/pendling"
              label={ridden && arrived && tripEnd ? `På väg ${riddenToWork ? 'till jobbet' : 'hem'}, ${riddenToWork ? 'framme' : 'hemma'} ${hhmm(tripEnd)}. Visa trafikläget.` : ridden ? `Du är på ${ridden.product ?? 'tåg'} ${ridden.ident}${ridden.canceled ? ', inställt' : ridden.delay ? `, ${plural(ridden.delay, 'minut', 'minuter')} sent` : ', i tid'}${riddenArr ? `, framme ${ridden.dest} cirka ${hhmm(riddenArr)}` : ''}${onward.length ? `, framme ${riddenToWork ? 'på jobbet' : 'hemma'} ${hhmm(onward.at(-1)!.arr)}` : ''}. Visa trafikläget.` : `Pendling ${dir === 'out' ? 'mot Stockholm' : 'mot Eskilstuna'}${trains[0] ? `: nästa tåg ${hhmm(trains[0].est ?? trains[0].dep)}${trains[0].canceled ? ', inställt' : trains[0].delay ? `, ${plural(trains[0].delay, 'minut', 'minuter')} sent` : ''}` : ''}${nextTransit ? `. ${transitHome ? 'Hem' : tg?.label}: ${leaveIn < -1 ? `sen ${plural(-leaveIn, 'minut', 'minuter')}, ta cykel eller taxi` : `gå om ${plural(Math.max(0, leaveIn), 'minut', 'minuter')}`}, ${transitHome ? 'hemma' : 'framme'} ${hhmm(nextTransit.arr)}` : ''}. Visa alla avgångar.`}
              className={`order-3 lg:order-none lg:shrink-0 ${nextTransit || ridden ? '' : COMMUTE_H}`}>
              {!ridden && trains.length === 0 && <p className="text-[1.125rem] text-dim">{sunday ? 'Måndagens tåg från 06:00 visas här' : 'Inga tåg de närmaste timmarna'}</p>}
              {/* Fyra avgångar i 2×2. Går ett tåg inom 45 min lyfts det fram stort med nedräkning, följande två på en rad. */}
              {!ridden && justLeft && (
                <p className="flex items-center justify-between gap-3 text-[1rem]">
                  <span>Sitter du på {justLeft.product ?? 'tåg'} {justLeft.ident} ({hhmm(justLeft.est ?? justLeft.dep)})?</span>
                  <OnTrainButton ident={justLeft.ident} dep={justLeft.dep} arr={justLeft.arr} label="Ja ✓" />
                </p>
              )}
              {!ridden && nextTransit && tg && (
                <p className="flex items-baseline gap-2 text-[1rem]">
                  <span className="font-semibold">{transitHome ? 'Hem' : tg.label}:</span>
                  <span>
                    <span className="font-semibold" style={leaveIn < -1 ? { color: C.warn } : undefined}>{leaveIn < -1 ? `sen ${-leaveIn} min – ta cykel eller taxi` : leaveIn <= 0 ? 'gå nu' : `gå om ${leaveIn} min`}</span>
                    {' · '}{transitHome ? 'hemma' : 'framme'} {transitLate?.delay ? `ca ${hhmm(nextTransit.arr + transitLate.delay * 60_000)}` : hhmm(nextTransit.arr)}
                  </span>
                  {transitLate?.canceled && <span className="font-semibold" style={{ color: C.bad }}>inställt tåg</span>}
                </p>
              )}
              {/* Resebeskrivningen för förslaget (gång, tåg, SL) med spår och förseningar. */}
              {!ridden && nextTransit && commute && <TransitLegs trip={nextTransit} trains={[...commute.out, ...commute.home, ...commute.all]} compact />}
              {ridden && sure ? (
                // Säkert tågläge: måltiden stort (som utetemperaturen), var tåget är och resplanen.
                <>
                  {goalTime != null && (
                    <div className="flex items-end justify-between gap-3">
                      <span className="flex flex-col">
                        <span className="text-[1rem] font-semibold text-dim">{riddenToWork ? 'Framme på jobbet' : 'Hemma'}</span>
                        <span className="text-[3rem] leading-none font-bold tracking-tight tabular-nums">{hhmm(goalTime)}</span>
                      </span>
                      <span className="flex flex-col items-end text-[1rem] font-semibold">
                        <span>om {plural(Math.max(0, Math.round((goalTime - now) / 60_000)), 'minut', 'minuter')}</span>
                        <span style={{ color: ridden.canceled ? C.bad : ridden.delay >= 3 ? C.warn : C.mute }}>
                          {ridden.canceled ? 'Inställt' : ridden.delay >= 1 ? `Tåget +${ridden.delay} min` : 'Tåget i tid'}
                        </span>
                      </span>
                    </div>
                  )}
                  {!arrived && <TrainProgress ident={ridden.ident} />}
                  {commute && tripLegs.length > 0 && <TransitLegs trip={{ dep: tripLegs[0].dep, arr: tripLegs.at(-1)!.arr, legs: tripLegs, startAt: null, endAt: null }} now={now} trains={[...commute.out, ...commute.home, ...commute.all]} compact />}
                  <div className="flex flex-wrap gap-2">
                    <TrainRoute ident={ridden.ident} />
                    {confirmed && <OnTrainButton ident={ridden.ident} dep={ridden.dep} arr={ridden.arr} confirmed />}
                  </div>
                </>
              ) : ridden ? (
                <>
                  {/* Tågläge: resten av resan efter tåget (byte i Stockholm C eller promenad hem). */}
                  {ridden && onward.length > 0 && commute && (
                    <div className="flex flex-col gap-1">
                      <p className="text-[1rem]"><span className="font-semibold">{riddenToWork ? 'Jobbet' : 'Hem'}:</span> {riddenToWork ? 'framme' : 'hemma'} ca {hhmm(onward.at(-1)!.arr)}</p>
                      <TransitLegs trip={{ dep: tripLegs[0].dep, arr: tripLegs.at(-1)!.arr, legs: tripLegs, startAt: null, endAt: null }} now={now} trains={[...commute.out, ...commute.home, ...commute.all]} compact />
                    </div>
                  )}
                  {!arrived && <div className={onward.length > 0 ? "border-t border-line pt-3" : ""}><RiddenTrain t={ridden} guessed={!!guessed} confirmed={!!confirmed} /></div>}
                  {/* Om tågläget har fel: kommande avgångar inom en timme (minst nästa). */}
                  {!arrived && nextHour.length > 0 && (
                    <div className="flex flex-col gap-1.5 border-t border-line pt-3">
                      <span className="text-[0.9375rem] font-semibold text-dim">Inte på det tåget? Nästa avgångar</span>
                      <HomeTrains trains={nextHour} serverNow={now} journey={tg ? (dir === 'out' ? 'out' : 'home') : undefined} />
                    </div>
                  )}
                </>
              ) : <div className={nextTransit ? 'border-t border-line pt-3' : ''}><HomeTrains trains={trains} serverNow={now} journey={tg ? (dir === 'out' ? 'out' : 'home') : undefined} /></div>}
              {/* Vägen: upp till två händelser i samma radformat som tågen (status till höger). Inte i tågläget. */}
              <ul hidden={!!ridden} className="flex flex-col gap-1.5 border-t border-line pt-3">
                {roads.length === 0 && (
                  <li className="flex items-center gap-3 text-[1rem]">
                    <Icon name="road" size={22} /><span className="grow text-dim">Väg 56/E18</span>
                    <span className="font-semibold" style={{ color: C.ok }}>Fritt</span>
                  </li>
                )}
                {roads.slice(0, 2).map((g) => (
                  <li key={g.id} className="flex min-w-0 items-center gap-3">
                    <Icon name="road" size={22} />
                    <span className="flex min-w-0 grow flex-col leading-tight">
                      <span className="truncate text-[1rem] font-semibold">{g.type} · {g.road.replace(/^Väg/, 'väg')}{g.count > 1 ? ` ×${g.count}` : ''}</span>
                      <span className="truncate text-[1rem] text-dim">{g.places.map(shortPlace).filter(Boolean)[0] ?? ''}</span>
                    </span>
                    <RoadImpact tone={g.tone} className="text-[1rem]" />
                  </li>
                ))}
                {roads.length > 2 && <li className="pl-[2.125rem] text-[1rem] text-dim">+ {roads.length - 2} till</li>}
              </ul>
            </Card>
          )}
          {commute && !commute.trains && homeGoal?.atGoal && dir === 'out' && (
            <Card title={<>Trafik<span className="ml-auto rounded-full bg-white/[0.08] px-3 py-1 text-[1.0625rem] font-bold text-fg">På jobbet</span></>} icon="road" href="/pendling"
              label="Du är på jobbet. Hemresan visas från klockan 12. Visa trafikläget." className="order-3 lg:order-none lg:shrink-0">
              <p className="text-[1rem] text-dim">Hemresan visas från 12:00</p>
            </Card>
          )}
          {commute && !commute.trains && !(homeGoal?.atGoal && dir === 'out') && (
            <Card
              title={homeGoal ? `${homeGoal.driving ? 'Du kör · ' : ''}${homeGoal.home ? (homeGoal.driving ? 'hem' : 'Hem') : `${homeGoal.driving ? 'till' : 'Till'} ${homeGoal.label.toLowerCase()}`}` : 'Väg 56/E18 · Eskilstuna–Västerås'}
              icon="road" href="/pendling" className="order-3 lg:order-none lg:shrink-0"
              label={homeGoal
                ? `${homeGoal.home ? 'Hem' : `Till ${homeGoal.label.toLowerCase()}`}: ${homeGoal.home ? 'hemma' : 'framme'} klockan ${hhmm(homeGoal.eta.arrive)} ${homeGoal.driving ? 'med nuvarande trafik' : 'om du åker nu'}, ${plural(homeGoal.eta.minutes, 'minut', 'minuter')}${homeGoal.eta.trafficMin > 0 ? `, varav ${plural(homeGoal.eta.trafficMin, 'minut', 'minuter')} trafik` : ''}. ${roads.length ? `${plural(roads.length, 'störning', 'störningar')} längs vägen.` : 'Fritt längs vägen.'} Visa trafikläget.`
                : `Väg 56 och E18: ${roads.length ? plural(roads.length, 'störning', 'störningar') : 'fritt'}. Visa trafikläget.`}
            >
              {homeGoal && (
                // Samma upplägg som på Trafik: liten rubrik, ETA störst, restid/avstånd/trafik mindre under.
                <div className="flex flex-col gap-0.5 border-b border-line pb-3">
                  <span className="text-[0.9375rem] font-semibold text-dim">{homeGoal.driving ? 'Du kör nu' : 'Om du åker nu'}</span>
                  <span className="flex items-baseline gap-2 leading-none">
                    <span className="text-[1.0625rem] font-semibold">{homeGoal.home ? 'Hemma' : 'Framme'}</span>
                    <span className="text-[2.25rem] font-extrabold tabular-nums">{hhmm(homeGoal.eta.arrive)}</span>
                  </span>
                  <span className="text-[1rem] text-dim">
                    {homeGoal.eta.minutes} min · {Math.round(homeGoal.eta.km)} km{homeGoal.fromHere ? ' härifrån' : ''}
                    {homeGoal.eta.trafficMin > 0 && <span className="font-bold" style={{ color: C.warn }}> · +{homeGoal.eta.trafficMin} min trafik</span>}
                  </span>
                </div>
              )}
              {homeGoal && <span className="text-[0.9375rem] font-semibold text-dim">Längs väg 56/E18</span>}
              {roads.length === 0 ? <p className="text-[1.5rem] font-semibold" style={{ color: C.ok }}>Fritt</p> : (
                <ul className="flex flex-col gap-2">
                  {roads.slice(0, 3).map((g) => (
                    <li key={g.id} className="flex min-w-0 items-start gap-3 text-[1rem]">
                      <span className="flex min-w-0 grow flex-col leading-tight">
                        <span className="font-semibold">{g.type} · {g.road.replace(/^Väg/, 'väg')}</span>
                        <span className="truncate text-dim">{g.places.map(shortPlace)[0] ?? ''}</span>
                      </span>
                      <RoadImpact tone={g.tone} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
          {hasCal && <div className="order-5 flex min-h-0 lg:order-none lg:min-h-[8.125rem]"><CalendarWidget /></div>}
          {/* Speglad kalender (t.ex. Fredriks hos Ulrika) under den egna. */}
          {hasMirror && <div className="order-5 flex min-h-0 lg:order-none lg:min-h-[8.125rem]"><CalendarWidget src="/api/calendar/mirror" title={mirrorTitle()} id="kalender-spegel" /></div>}
        </div>

        {/* HEMMET: kompakta rader, avvikelser i färg. */}
        <Card className="order-6 lg:order-none lg:col-span-4 2xl:col-span-3 cols2:2xl:col-span-1 lg:self-start lg:py-3 lg:max-h-full cols2:lg:col-span-1 cols2:lg:col-start-1 cols2:lg:row-start-4 cols2:lg:max-h-none">
          <h2 className="sr-only">Hemmet</h2>
          <div className="scroll-x flex min-h-0 flex-col overflow-y-auto lg:grow" style={{ '--row-h': rowCount > 6 ? '3.1875rem' : '3.625rem' } as React.CSSProperties}>
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
                icon={open.length ? 'shieldAlert' : 'shield'} label="Dörrar & fönster" href="/dorrar"
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
              fixed ? (
                // Fast pris: rörligt nu (inkl. moms) jämfört med det fasta.
                <Row icon="money" label="Elpris rörligt" href="/energi?vy=pris" value={Math.round(price.now.ore * VAT)} unit="öre/kWh"
                  color={price.now.ore * VAT < fixed ? C.ok : C.bad}
                  detail={`Fast ${Math.round(fixed)} öre · rörligt ${Math.round(Math.abs(price.now.ore * VAT - fixed))} öre ${price.now.ore * VAT < fixed ? 'billigare' : 'dyrare'}`}
                />
              ) : (
              <Row icon="money" label="Elpris" href="/energi?vy=pris" value={Math.round(price.now.ore)} unit="öre/kWh" color={priceColor}
                detail={cheap ? `Billigast ${hhmm(cheap.start).slice(0, 2)}–${hhmm(cheap.end).slice(0, 2)} · ${Math.round(cheap.ore)} öre` : price.level?.label}
              />
              )
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
