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

const tab = (active: boolean) =>
  `flex min-h-12 items-center gap-2 rounded-full px-5 text-base font-extrabold ${active ? 'bg-ink text-white' : 'bg-white'}`;

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ m?: string; p?: string }> }) {
  const { m, p } = await searchParams;
  const view: View = m === 'lights' ? 'lights' : isMetric(m) ? m : 'temp';
  const metric: MetricKey = view === 'lights' ? 'temp' : view;
  const period: PeriodKey = isPeriod(p) ? p : '24h';
  const cfg = METRICS[metric];
  const [series, timeline] = view === 'lights'
    ? [[], await loadLightTimeline(period)]
    : [await loadHistory(metric, period), null];
  // Energi: en stapel per intervall för alla mätare; korten visar varje mätare.
  const chartSeries = cfg.delta && series.length ? [sumSeries(series, 'Alla mätare', '#8B5CF6')] : series;
  const href = (v: View, pp: PeriodKey) => `/historik?m=${v}&p=${pp}`;

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-[44px] leading-tight font-extrabold tracking-tight">Historik</h1>
        <nav aria-label="Period" className="flex gap-2">
          {(Object.keys(PERIODS) as PeriodKey[]).map((k) => (
            <Link key={k} href={href(view, k)} aria-current={k === period ? 'page' : undefined} className={tab(k === period)}>
              {PERIODS[k].label}
            </Link>
          ))}
        </nav>
      </header>

      <nav aria-label="Mått" className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={href(v.key, period)}
            aria-current={v.key === view ? 'page' : undefined}
            className={`flex min-h-20 items-center gap-3 rounded-[24px] px-4 text-lg font-extrabold ${
              v.key === view ? 'bg-sun' : 'bg-white'
            }`}
          >
            <span className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ${v.key === view ? 'bg-white/60' : 'bg-ground'}`}>
              <Icon name={v.icon} size={26} />
            </span>
            {v.label}
          </Link>
        ))}
      </nav>

      {timeline && <LightTimeline {...timeline} />}

      {!timeline && <section className="rounded-[28px] bg-white p-5">
        {chartSeries.length ? (
          <HistoryChart
            series={chartSeries.map(({ id, label, color, points }) => ({ id, label, color, points }))}
            unit={cfg.unit}
            decimals={cfg.decimals}
            bars={!!cfg.delta}
            longPeriod={period !== '24h'}
          />
        ) : (
          <p className="p-10 text-center text-lg font-bold text-ink-2">Ingen historik för perioden än.</p>
        )}
      </section>}

      {series.length > 0 && (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {series.map((s) => (
            <div key={s.id} className="flex flex-col gap-1.5 rounded-3xl bg-white p-4">
              <span className="flex items-center gap-2 font-extrabold">
                <span className="size-3.5 shrink-0 rounded-full" style={{ background: cfg.delta ? '#8B5CF6' : s.color }} />
                <span className="truncate">{s.label}</span>
              </span>
              {cfg.delta ? (
                <>
                  <span className="text-3xl font-extrabold tracking-tight">{fmtValue(metric, s.total)}</span>
                  <span className="text-sm font-bold text-ink-2">förbrukat {PERIODS[period].label}</span>
                </>
              ) : (
                <>
                  <span className="text-3xl font-extrabold tracking-tight">{fmtValue(metric, s.latest)}</span>
                  <span className="text-sm font-bold text-ink-2">
                    min {fmtValue(metric, s.min)} · max {fmtValue(metric, s.max)}
                  </span>
                </>
              )}
            </div>
          ))}
        </section>
      )}
    </>
  );
}
