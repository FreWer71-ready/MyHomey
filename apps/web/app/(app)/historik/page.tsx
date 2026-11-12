import Link from 'next/link';
import { HistoryChart } from '@/components/HistoryChart';
import { Icon, type IconName } from '@/components/Icon';
import { LightTimeline } from '@/components/LightTimeline';
import { ScrollActive } from '@/components/ScrollActive';
import { loadHistory, loadLightTimeline, loadPresenceTimeline, loadWine, loadWineHistory } from '@/lib/data';
import {
  METRICS, PERIODS, fmtValue, isMetric, isPeriod, sumSeries, type MetricKey, type PeriodKey,
} from '@/lib/history';

export const dynamic = 'force-dynamic';

type View = MetricKey | 'lights' | 'presence' | 'wine';
const VIEWS: { key: View; label: string; icon: IconName }[] = [
  { key: 'temp', label: METRICS.temp.label, icon: 'thermo' },
  { key: 'hum', label: 'Fukt', icon: 'drop' },
  { key: 'power', label: METRICS.power.label, icon: 'bolt' },
  { key: 'energy', label: METRICS.energy.label, icon: 'chart' },
  { key: 'lights', label: 'Lampor', icon: 'bulb' },
  { key: 'presence', label: 'Närvaro', icon: 'home' },
  { key: 'wine', label: 'Vinkällare', icon: 'wine' },
];
const SHORT: PeriodKey[] = ['4h', '12h', '24h'];

const chip = (active: boolean) =>
  `flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 font-extrabold ${active ? 'bg-sun text-ink' : 'glass'}`;
/** Mobil: en rad som sveps i sidled (kant till kant). Större skärmar: radbryts som vanligt. */
const scrollRow = 'scroll-x flex gap-1.5 max-md:-mx-3 max-md:overflow-x-auto max-md:px-3 md:flex-wrap';

export default async function HistoryPage({
  searchParams,
}: { searchParams: Promise<{ m?: string; p?: string; s?: string }> }) {
  const { m, p, s: sel } = await searchParams;
  const view: View = m === 'lights' || m === 'presence' || m === 'wine' ? m : isMetric(m) ? m : 'temp';
  const metric: MetricKey = view === 'lights' || view === 'presence' || view === 'wine' ? 'temp' : view;
  const period: PeriodKey = isPeriod(p) ? p : '24h';
  const cfg = METRICS[metric];
  const [wine, winePts] = await Promise.all([loadWine(), view === 'wine' ? loadWineHistory() : Promise.resolve([] as [number, number][])]);
  const [series, timeline] = view === 'wine'
    ? [[], null]
    : view === 'lights' || view === 'presence'
      ? [[], await (view === 'presence' ? loadPresenceTimeline(period) : loadLightTimeline(period))]
      : [await loadHistory(metric, period), null];
  const views = VIEWS.filter((v) => v.key !== 'wine' || wine);

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
        <h1 className="text-[32px] leading-tight font-extrabold tracking-tight">Historik</h1>
        {view !== 'wine' && <nav aria-label="Period" className={scrollRow}>
          {(Object.keys(PERIODS) as PeriodKey[]).map((k) => (
            <Link key={k} href={href(view, k, sel)} aria-current={k === period ? 'page' : undefined} className={chip(k === period)}>
              {PERIODS[k].label}
            </Link>
          ))}
        </nav>}
      </header>

      <nav aria-label="Mått" className={`scroll-x flex gap-2 max-lg:-mx-3 max-lg:overflow-x-auto max-lg:px-3 lg:grid lg:gap-2.5 ${views.length > 6 ? 'lg:grid-cols-7' : 'lg:grid-cols-6'}`}>
        {views.map((v) => (
          <Link
            key={v.key}
            href={href(v.key, period)}
            aria-current={v.key === view ? 'page' : undefined}
            className={`flex min-h-12 shrink-0 items-center gap-2 whitespace-nowrap rounded-[20px] px-3 font-extrabold lg:min-h-14 lg:min-w-0 lg:px-2.5 ${
              v.key === view ? 'bg-sun' : 'glass'
            }`}
          >
            <span className={`flex size-8 shrink-0 items-center justify-center rounded-xl ${v.key === view ? 'bg-glass-hi' : 'bg-glass-2'}`}>
              <Icon name={v.icon} size={20} />
            </span>
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
          <div className="rounded-[24px] glass p-3">
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
                <div key={k} className="flex flex-col rounded-[20px] glass px-3 py-2">
                  <span className="text-[13px] font-bold text-dim">{k}</span>
                  <span className="truncate text-xl leading-tight font-extrabold">{v}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {!timeline && view !== 'wine' && (
        <section className="rounded-[24px] glass p-3">
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
        <section aria-label="Filtrera på rum" className="grid grid-cols-2 gap-2 md:grid-cols-[repeat(auto-fill,minmax(170px,1fr))]">
          {series.map((s) => {
            const active = sel === s.id;
            return (
              <Link
                key={s.id}
                href={active ? href(view, period) : href(view, period, s.id)}
                aria-pressed={active}
                className={`flex flex-col rounded-[20px] glass px-3 py-2 ${
                  active ? 'shadow-[inset_0_0_0_3px_var(--color-ink)]' : sel ? 'opacity-55' : ''
                }`}
              >
                <span className="flex items-center gap-2 font-extrabold">
                  <span className="size-3.5 shrink-0 rounded-full" style={{ background: cfg.delta ? '#8B5CF6' : s.color }} />
                  <span className="truncate">{s.label}</span>
                </span>
                <span className="text-xl leading-tight font-extrabold tracking-tight">
                  {fmtValue(metric, cfg.delta ? s.total : s.latest)}
                </span>
                <span className="truncate text-[13px] font-bold text-dim">
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
