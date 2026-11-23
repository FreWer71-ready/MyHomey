import Link from 'next/link';
import { HistoryChart } from '@/components/HistoryChart';
import { Icon, type IconName } from '@/components/Icon';
import { LightTimeline } from '@/components/LightTimeline';
import { ScrollActive } from '@/components/ScrollActive';
import { TrainHistory, isRange } from '@/components/TrainHistory';
import { loadTrips, ticket } from '@/lib/trips-source';

import { loadHistory, loadHistoryAvail, loadLightTimeline, loadPresenceTimeline, loadRoadHistory, loadWine, loadWineHistory, type RoadHistRow } from '@/lib/data';
import {
  METRICS, PERIODS, fmtValue, isMetric, isPeriod, sumSeries, type MetricKey, type PeriodKey,
} from '@/lib/history';

export const dynamic = 'force-dynamic';

type View = MetricKey | 'lights' | 'presence' | 'wine' | 'road' | 'train';
const VIEWS: { key: View; label: string; icon: IconName }[] = [
  { key: 'temp', label: METRICS.temp.label, icon: 'thermo' },
  { key: 'hum', label: 'Fukt', icon: 'drop' },
  { key: 'power', label: METRICS.power.label, icon: 'bolt' },
  { key: 'energy', label: METRICS.energy.label, icon: 'chart' },
  { key: 'lights', label: 'Lampor', icon: 'bulb' },
  { key: 'presence', label: 'Närvaro', icon: 'home' },
  { key: 'road', label: 'Vägväder', icon: 'road' },
  { key: 'train', label: 'Tåg', icon: 'train' },
  { key: 'wine', label: 'Vinkällare', icon: 'wine' },
];
// Trafikverkets vägväderstationer längs pendlingen (samma som på Pendling).
const ROAD_STATIONS: [string, string][] = [['429', 'Eskilstuna Ö'], ['418', 'Gröndal'], ['1903', 'Mellansundet'], ['1924', 'Vallbymotet']];

/** Grafer för en vägväderstation: temperatur, nederbörd, vind, luftfuktighet. */
function RoadCharts({ rows, long }: { rows: RoadHistRow[]; long: boolean }) {
  if (!rows.length) return <p className="rounded-[1.5rem] glass p-10 text-center text-lg font-bold text-dim">Ingen vägväderdata för perioden.</p>;
  const col = (i: number) => rows.filter((r) => r[i] != null).map((r) => [r[0], r[i] as number] as [number, number]);
  const rain = rows.reduce((a, r) => a + (r[7] ?? 0), 0);
  const charts: { title: string; extra?: string; unit: string; decimals: number; bars: boolean; series: { id: string; label: string; color: string; points: [number, number][] }[] }[] = [
    { title: 'Temperatur', unit: '°', decimals: 1, bars: false, series: [
      { id: 'air', label: 'Luft', color: '#FF7A1A', points: col(1) },
      { id: 'road', label: 'Vägbana', color: '#1E6FE0', points: col(2) },
      { id: 'dew', label: 'Daggpunkt', color: '#8B5CF6', points: col(3) },
    ] },
    { title: 'Nederbörd', extra: `${rain.toLocaleString('sv-SE', { maximumFractionDigits: 1 })} mm totalt`, unit: ' mm', decimals: 1, bars: true, series: [
      { id: 'rain', label: 'Nederbörd', color: '#0A8F9E', points: col(7) },
    ] },
    { title: 'Vind', unit: ' m/s', decimals: 1, bars: false, series: [
      { id: 'wind', label: 'Medelvind', color: '#12B76A', points: col(5) },
      { id: 'gust', label: 'Byar', color: '#E8418C', points: col(6) },
    ] },
    { title: 'Luftfuktighet', unit: ' %', decimals: 0, bars: false, series: [{ id: 'rh', label: 'Fukt', color: '#8A93B8', points: col(4) }] },
  ];
  return (
    <>
      {charts.filter((c) => c.series.some((x) => x.points.length)).map((c) => (
        <section key={c.title} className="rounded-[1.5rem] glass p-3">
          <h2 className="mb-1 flex items-baseline justify-between gap-2 px-1 text-xl font-extrabold">
            {c.title}{c.extra && <span className="text-[0.875rem] font-bold text-dim">{c.extra}</span>}
          </h2>
          <HistoryChart series={c.series} unit={c.unit} decimals={c.decimals} bars={c.bars} longPeriod={long} fit={760} />
        </section>
      ))}
      <p className="px-1 text-[0.875rem] font-bold text-dim">Källa: Trafikverket (VViS). Vägväder sparas ca 7 dygn bakåt.</p>
    </>
  );
}
const SHORT: PeriodKey[] = ['4h', '12h', '24h'];

const chip = (active: boolean) => `pill ${active ? 'on' : ''}`;
/** Mobil: en rad som sveps i sidled (kant till kant). Större skärmar: radbryts som vanligt. */
const scrollRow = 'scroll-x flex gap-1.5 max-md:-mx-3 max-md:overflow-x-auto max-md:px-3 md:flex-wrap';

export default async function HistoryPage({
  searchParams,
}: { searchParams: Promise<{ m?: string; p?: string; s?: string; r?: string }> }) {
  const { m, p, s: sel, r } = await searchParams;
  const wanted: View = m === 'lights' || m === 'presence' || m === 'wine' || m === 'road' || m === 'train' ? m : isMetric(m) ? m : 'temp';
  const period: PeriodKey = isPeriod(p) ? p : '24h';
  // Flikar utan data för hushållet visas inte. Kommer data in dyker fliken upp av sig själv.
  const [wine, avail] = await Promise.all([loadWine(), loadHistoryAvail()]);
  const has = (v: View) => v === 'temp' ? avail.caps.has('measure_temperature') : v === 'hum' ? avail.caps.has('measure_humidity')
    : v === 'power' ? avail.caps.has('measure_power') || avail.caps.has('measure_power.homey') : v === 'energy' ? avail.caps.has('meter_power')
    : v === 'lights' ? avail.caps.has('onoff') : v === 'presence' ? avail.caps.has('alarm_motion')
    : v === 'wine' ? !!wine : v === 'train' ? avail.trips : avail.road;
  const views = VIEWS.filter((v) => has(v.key));
  if (!views.length) {
    return (
      <>
        <h1 className="text-[2rem] leading-tight font-extrabold tracking-tight">Historik</h1>
        <p className="rounded-[1.5rem] glass p-10 text-center text-lg font-bold text-dim">Ingen historik än.</p>
      </>
    );
  }
  const view: View = views.some((v) => v.key === wanted) ? wanted : views[0].key;
  const metric: MetricKey = view === 'lights' || view === 'presence' || view === 'wine' || view === 'road' || view === 'train' ? 'temp' : view;
  const cfg = METRICS[metric];
  const winePts = view === 'wine' ? await loadWineHistory() : ([] as [number, number][]);
  const roadStation = ROAD_STATIONS.some(([id]) => id === sel) ? sel! : '429';
  const roadRows = view === 'road' ? await loadRoadHistory(roadStation, period) : [];
  const trips = view === 'train' ? await loadTrips() : [];
  const [series, timeline] = view === 'wine' || view === 'road' || view === 'train'
    ? [[], null]
    : view === 'lights' || view === 'presence'
      ? [[], await (view === 'presence' ? loadPresenceTimeline(period) : loadLightTimeline(period))]
      : [await loadHistory(metric, period), null];

  // Valt rum/serie (?s=) filtrerar grafen; samma tryck igen visar alla.
  const shown = sel ? series.filter((x) => x.id === sel) : series;
  const chartSeries = cfg.delta && shown.length
    ? [sumSeries(shown, sel && shown.length === 1 ? shown[0].label : 'Alla mätare', '#8B5CF6')]
    : shown;
  const rooms = timeline && sel ? timeline.rooms.filter((r) => r.name === sel) : timeline?.rooms;
  const href = (v: View, pp: PeriodKey, s?: string) =>
    `/historik?m=${v}&p=${pp}${s ? `&s=${encodeURIComponent(s)}` : ''}`;

  return (
    <>
      <ScrollActive />
      <header className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-3">
        <h1 className="text-[2rem] leading-tight font-extrabold tracking-tight">Historik</h1>
        {view !== 'wine' && view !== 'train' && <nav aria-label="Period" className={scrollRow}>
          {(Object.keys(PERIODS) as PeriodKey[]).map((k) => (
            <Link key={k} href={href(view, k, sel)} aria-current={k === period ? 'page' : undefined} className={chip(k === period)}>
              {PERIODS[k].label}
            </Link>
          ))}
        </nav>}
      </header>

      <nav aria-label="Mått" className={`scroll-x flex gap-2 max-lg:-mx-3 max-lg:overflow-x-auto max-lg:px-3 lg:grid lg:gap-2.5 ${views.length > 8 ? 'lg:grid-cols-9' : views.length > 7 ? 'lg:grid-cols-8' : views.length > 6 ? 'lg:grid-cols-7' : 'lg:grid-cols-6'}`}>
        {views.map((v) => (
          <Link
            key={v.key}
            href={href(v.key, period)}
            aria-current={v.key === view ? 'page' : undefined}
            className={`pill lg:min-w-0 lg:justify-center ${v.key === view ? 'on' : ''}`}
          >
            <Icon name={v.icon} size={20} />
            {v.label}
          </Link>
        ))}
      </nav>

      {timeline && (
        <>
          {view !== 'presence' && <nav aria-label="Rum" className={scrollRow}>
            <Link href={href(view, period)} aria-current={!sel ? 'page' : undefined} className={chip(!sel)}>Alla rum</Link>
            {timeline.rooms.map((r) => (
              <Link key={r.name} href={href(view, period, r.name)} aria-current={sel === r.name ? 'page' : undefined} className={chip(sel === r.name)}>
                {r.name}
              </Link>
            ))}
          </nav>}
          <LightTimeline rooms={rooms ?? []} since={timeline.since} now={timeline.now} kind={view === 'presence' ? 'presence' : 'light'} />
        </>
      )}

      {view === 'wine' && (
        <section className="flex flex-col gap-3">
          <div className="rounded-[1.5rem] glass p-3">
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 px-1">
              <h2 className="text-xl font-extrabold">Flaskor i källaren</h2>
              <a href="https://wine.trand.se" target="_blank" rel="noopener noreferrer" className="font-bold text-sun">Öppna Trandvine ↗</a>
            </div>
            {winePts.length > 1 ? (
              <HistoryChart series={[{ id: 'wine', label: 'Flaskor', color: '#E0577A', points: winePts }]} unit=" fl" decimals={0} bars={false} longPeriod fit={430} />
            ) : (
              <p className="p-10 text-center text-lg font-bold text-dim">Ingen historik än.</p>
            )}
          </div>
          {wine && (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {[
                ['I källaren nu', `${wine.total} flaskor`],
                ['Som mest', `${Math.max(0, ...winePts.map((p) => p[1]))} flaskor`],
                ['Senaste 30 dagarna', (() => {
                  const ago = Date.now() / 1000 - 30 * 86400;
                  const before = [...winePts].reverse().find((p) => p[0] <= ago)?.[1] ?? 0;
                  const d = wine.total - before;
                  return `${d > 0 ? '+' : ''}${d} flaskor`;
                })()],
                ['Senast tillagd', [wine.latest?.producer, wine.latest?.year].filter(Boolean).join(' ') || '–'],
              ].map(([k, v]) => (
                <div key={k} className="flex flex-col rounded-[1.25rem] glass px-3 py-2">
                  <span className="text-[0.875rem] font-bold text-dim">{k}</span>
                  <span className="truncate text-xl leading-tight font-extrabold">{v}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {view === 'train' && <TrainHistory trips={trips} range={isRange(r) ? r : '30d'} ticket={ticket()} />}

      {view === 'road' && (
        <>
          <nav aria-label="Station" className={scrollRow}>
            {ROAD_STATIONS.map(([id, name]) => (
              <Link key={id} href={href('road', period, id)} aria-current={id === roadStation ? 'page' : undefined} className={chip(id === roadStation)}>{name}</Link>
            ))}
          </nav>
          <RoadCharts rows={roadRows} long={!SHORT.includes(period)} />
        </>
      )}

      {!timeline && view !== 'wine' && view !== 'road' && view !== 'train' && (
        <section className="rounded-[1.5rem] glass p-3">
          {chartSeries.length ? (
            <HistoryChart
              series={chartSeries.map(({ id, label, color, points }) => ({ id, label, color, points }))}
              unit={cfg.unit}
              decimals={cfg.decimals}
              bars={!!cfg.delta}
              longPeriod={!SHORT.includes(period)}
              fit={500}
            />
          ) : (
            <p className="p-10 text-center text-lg font-bold text-dim">Ingen historik för perioden än.</p>
          )}
        </section>
      )}

      {series.length > 0 && (
        <section aria-label="Filtrera på rum" className="grid grid-cols-2 gap-2 md:grid-cols-[repeat(auto-fill,minmax(10.625rem,1fr))]">
          {series.map((s) => {
            const active = sel === s.id;
            return (
              <Link
                key={s.id}
                href={active ? href(view, period) : href(view, period, s.id)}
                aria-pressed={active}
                className={`flex flex-col rounded-[1.25rem] glass px-3 py-2 ${
 active ? 'shadow-[inset_0_0_0_3px_var(--color-ink)]' : sel ? 'text-dim [&_*]:!text-dim' : ''
 }`}
              >
                <span className="flex items-center gap-2 font-extrabold">
                  <span className="size-3.5 shrink-0 rounded-full" style={{ background: cfg.delta ? '#8B5CF6' : s.color }} />
                  <span className="truncate">{s.label}</span>
                </span>
                <span className="text-xl leading-tight font-extrabold tracking-tight">
                  {fmtValue(metric, cfg.delta ? s.total : s.latest)}
                </span>
                <span className="truncate text-[0.875rem] font-bold text-dim">
                  {cfg.delta
                    ? `förbrukat ${PERIODS[period].label}`
                    : `min ${fmtValue(metric, s.min)} · max ${fmtValue(metric, s.max)}`}
                </span>
              </Link>
            );
          })}
        </section>
      )}
    </>
  );
}
