import Link from 'next/link';
import { HistoryChart } from '@/components/HistoryChart';
import { Icon, type IconName } from '@/components/Icon';
import { LightTimeline } from '@/components/LightTimeline';
import { loadHistory, loadLightTimeline } from '@/lib/data';
import {
  METRICS, PERIODS, fmtValue, isMetric, isPeriod, sumSeries, type MetricKey, type PeriodKey,
} from '@/lib/history';

export const dynamic = 'force-dynamic';

type View = MetricKey | 'lights';
const VIEWS: { key: View; label: string; icon: IconName }[] = [
  { key: 'temp', label: METRICS.temp.label, icon: 'thermo' },
  { key: 'hum', label: METRICS.hum.label, icon: 'drop' },
  { key: 'power', label: METRICS.power.label, icon: 'bolt' },
  { key: 'energy', label: METRICS.energy.label, icon: 'chart' },
  { key: 'lights', label: 'Lampor', icon: 'bulb' },
];
const SHORT: PeriodKey[] = ['4h', '12h', '24h'];

const chip = (active: boolean) =>
  `flex min-h-11 items-center gap-2 rounded-full px-4 font-extrabold ${active ? 'bg-fg text-ground' : 'glass'}`;

export default async function HistoryPage({
  searchParams,
}: { searchParams: Promise<{ m?: string; p?: string; s?: string }> }) {
  const { m, p, s: sel } = await searchParams;
  const view: View = m === 'lights' ? 'lights' : isMetric(m) ? m : 'temp';
  const metric: MetricKey = view === 'lights' ? 'temp' : view;
  const period: PeriodKey = isPeriod(p) ? p : '24h';
  const cfg = METRICS[metric];
  const [series, timeline] = view === 'lights'
    ? [[], await loadLightTimeline(period)]
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
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[32px] leading-tight font-extrabold tracking-tight">Historik</h1>
        <nav aria-label="Period" className="flex flex-wrap gap-1.5">
          {(Object.keys(PERIODS) as PeriodKey[]).map((k) => (
            <Link key={k} href={href(view, k, sel)} aria-current={k === period ? 'page' : undefined} className={chip(k === period)}>
              {PERIODS[k].label}
            </Link>
          ))}
        </nav>
      </header>

      <nav aria-label="Mått" className="grid grid-cols-3 gap-2.5 lg:grid-cols-5">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={href(v.key, period)}
            aria-current={v.key === view ? 'page' : undefined}
            className={`flex min-h-14 items-center gap-2.5 rounded-[20px] px-3 font-extrabold ${
              v.key === view ? 'bg-sun' : 'glass'
            }`}
          >
            <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${v.key === view ? 'bg-glass-hi' : 'bg-glass-2'}`}>
              <Icon name={v.icon} size={22} />
            </span>
            {v.label}
          </Link>
        ))}
      </nav>

      {timeline && (
        <>
          <nav aria-label="Rum" className="flex flex-wrap gap-1.5">
            <Link href={href(view, period)} aria-current={!sel ? 'page' : undefined} className={chip(!sel)}>Alla rum</Link>
            {timeline.rooms.map((r) => (
              <Link key={r.name} href={href(view, period, r.name)} aria-current={sel === r.name ? 'page' : undefined} className={chip(sel === r.name)}>
                {r.name}
              </Link>
            ))}
          </nav>
          <LightTimeline rooms={rooms ?? []} since={timeline.since} now={timeline.now} />
        </>
      )}

      {!timeline && (
        <section className="rounded-[24px] glass p-4">
          {chartSeries.length ? (
            <HistoryChart
              series={chartSeries.map(({ id, label, color, points }) => ({ id, label, color, points }))}
              unit={cfg.unit}
              decimals={cfg.decimals}
              bars={!!cfg.delta}
              longPeriod={!SHORT.includes(period)}
            />
          ) : (
            <p className="p-10 text-center text-lg font-bold text-dim">Ingen historik för perioden än.</p>
          )}
        </section>
      )}

      {series.length > 0 && (
        <section aria-label="Filtrera på rum" className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-4">
          {series.map((s) => {
            const active = sel === s.id;
            return (
              <Link
                key={s.id}
                href={active ? href(view, period) : href(view, period, s.id)}
                aria-pressed={active}
                className={`flex flex-col gap-1 rounded-3xl glass p-3.5 ${
                  active ? 'shadow-[inset_0_0_0_3px_var(--color-ink)]' : sel ? 'opacity-55' : ''
                }`}
              >
                <span className="flex items-center gap-2 font-extrabold">
                  <span className="size-3.5 shrink-0 rounded-full" style={{ background: cfg.delta ? '#8B5CF6' : s.color }} />
                  <span className="truncate">{s.label}</span>
                </span>
                <span className="text-2xl font-extrabold tracking-tight">
                  {fmtValue(metric, cfg.delta ? s.total : s.latest)}
                </span>
                <span className="text-sm font-bold text-dim">
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
