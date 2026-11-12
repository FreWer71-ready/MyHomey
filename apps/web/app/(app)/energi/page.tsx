import Link from 'next/link';
import { HistoryChart } from '@/components/HistoryChart';
import { Icon, type IconName } from '@/components/Icon';
import { loadHistory, loadHome, loadPrices } from '@/lib/data';
import { PERIODS, fmtValue, sumSeries, type PeriodKey } from '@/lib/history';
import { fmtWatt, tint } from '@/lib/scale';
import { LEVELS, avg, dayKey, fmtOre, hhmm, hourly, levelOf, summarize, type Price } from '@/lib/prices';

export const dynamic = 'force-dynamic';

function Card({ bg, icon, label, value, sub }: { bg: string; icon: IconName; label: string; value: string; sub: string }) {
  return (
    <div className="glass flex flex-col gap-0.5 rounded-[22px] px-3.5 py-3" style={{ background: bg }}>
      <span className="flex items-center gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-glass-hi"><Icon name={icon} size={20} /></span>
        <span className="text-[15px] font-bold">{label}</span>
      </span>
      <span className="text-[34px] leading-tight font-extrabold tracking-tight">{value}</span>
      <span className="text-[15px] font-bold">{sub}</span>
    </div>
  );
}

type View = 'pris' | 'forbrukning';
const USE_PERIODS: PeriodKey[] = ['4h', '12h', '24h', '7d'];
const chip = (active: boolean) =>
  `flex min-h-12 items-center gap-2 rounded-full pr-5 pl-2 text-lg font-extrabold ${active ? 'bg-sun text-ink' : 'glass'}`;
const kwh = (v: number | null) => (v == null ? '–' : `${v.toLocaleString('sv-SE', { maximumFractionDigits: v < 10 ? 2 : 1 })} kWh`);

const span = (w: { start: number; end: number } | null) => (w ? `${hhmm(w.start)}–${hhmm(w.end)}` : '–');

export default async function EnergyPage({ searchParams }: { searchParams: Promise<{ vy?: string; p?: string; g?: string }> }) {
  const q = await searchParams;
  const view: View = q.vy === 'forbrukning' ? 'forbrukning' : 'pris';
  const period: PeriodKey = USE_PERIODS.includes(q.p as PeriodKey) ? (q.p as PeriodKey) : '24h';
  const [prices, h] = await Promise.all([loadPrices(), loadHome()]);
  const now = Date.now();
  const s = summarize(prices, now);
  const kwhChart = q.g === 'kwh';
  const href = (v: View, pp: PeriodKey = period, g = kwhChart) => `/energi?vy=${v}${v === 'forbrukning' ? `&p=${pp}${g ? '&g=kwh' : ''}` : ''}`;

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[32px] leading-tight font-extrabold tracking-tight">Energi</h1>
          <nav aria-label="Vy" className="flex gap-1.5">
            <Link href={href('pris')} aria-current={view === 'pris' ? 'page' : undefined} className={chip(view === 'pris')}>
              <span className="flex size-8 items-center justify-center rounded-full bg-ground/80"><Icon name="money" size={20} /></span> Elpris
            </Link>
            <Link href={href('forbrukning')} aria-current={view === 'forbrukning' ? 'page' : undefined} className={chip(view === 'forbrukning')}>
              <span className="flex size-8 items-center justify-center rounded-full bg-ground/80"><Icon name="bolt" size={20} /></span> Förbrukning
            </Link>
          </nav>
        </div>
        {/* Den andra vyns nyckeltal, tydligt och klickbart. */}
        {view === 'pris' ? (
          <Link href={href('forbrukning')} className="glass flex items-center gap-3 rounded-[20px] py-2 pr-5 pl-2" style={{ background: tint('#8B5CF6', 0.32) }}>
            <span className="flex size-11 items-center justify-center rounded-[14px] bg-glass-hi"><Icon name="bolt" size={24} /></span>
            <span className="flex flex-col leading-tight">
              <span className="text-[13px] font-bold tracking-wider uppercase">Effekt nu</span>
              <span className="text-2xl font-extrabold">{fmtWatt(h.powerW)}</span>
            </span>
          </Link>
        ) : (
          <Link href={href('pris')} className="glass flex items-center gap-3 rounded-[20px] py-2 pr-5 pl-2" style={{ background: s.level?.bg ?? 'var(--color-glass)' }}>
            <span className="flex size-11 items-center justify-center rounded-[14px] bg-glass-hi"><Icon name="money" size={24} /></span>
            <span className="flex flex-col leading-tight">
              <span className="text-[13px] font-bold tracking-wider uppercase">Elpris nu{s.level ? ` · ${s.level.label}` : ''}</span>
              <span className="text-2xl font-extrabold">{fmtOre(s.now?.ore)}</span>
            </span>
          </Link>
        )}
      </header>

      {view === 'pris' ? <PriceView prices={prices} s={s} now={now} /> : <UseView period={period} powerW={h.powerW} meters={h.powerMeters} href={href} kwhChart={kwhChart} />}
    </>
  );
}

async function UseView({ period, powerW, meters, href, kwhChart }: { period: PeriodKey; powerW: number; meters: number; href: (v: View, p?: PeriodKey, g?: boolean) => string; kwhChart: boolean }) {
  const [power, energy] = await Promise.all([loadHistory('power', period), loadHistory('energy', period)]);
  const total = power.length ? sumSeries(power, 'Effekt totalt', '#8B5CF6') : null;
  const used = energy.length ? sumSeries(energy, 'Förbrukning', '#2BB5C4') : null;
  const top = [...power].filter((x) => (x.latest ?? 0) > 0.5).sort((a, b) => (b.latest ?? 0) - (a.latest ?? 0)).slice(0, 6);
  const avgW = total?.points.length ? total.points.reduce((a, p) => a + p[1], 0) / total.points.length : null;
  const longPeriod = period === '7d';

  return (
    <>
      <nav aria-label="Period" className="flex flex-wrap gap-1.5">
        {USE_PERIODS.map((k) => (
          <Link key={k} href={href('forbrukning', k)} aria-current={k === period ? 'page' : undefined}
            className={`flex min-h-11 items-center rounded-full px-4 font-extrabold ${k === period ? 'bg-sun text-ink' : 'glass'}`}>
            {PERIODS[k].label}
          </Link>
        ))}
      </nav>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card bg={tint('#8B5CF6', 0.32)} icon="bolt" label="Effekt nu" value={fmtWatt(powerW)} sub={`${meters} mätare`} />
        <Card bg={tint('#2BB5C4', 0.3)} icon="chart" label={`Förbrukat ${PERIODS[period].label}`} value={kwh(used?.total ?? null)} sub="summa alla mätare" />
        <Card bg="var(--color-glass)" icon="power" label="Snitteffekt" value={avgW == null ? '–' : fmtWatt(Math.round(avgW))} sub={PERIODS[period].label} />
        <Card bg={tint('#F0503C')} icon="bolt" label="Högsta effekt" value={total?.max == null ? '–' : fmtWatt(Math.round(total.max))} sub={PERIODS[period].label} />
      </section>

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-[2fr_1fr]">
        <div className="min-w-0 rounded-[24px] glass p-3">
          <div className="mb-1 flex flex-wrap gap-1.5">
            {([[false, 'Effekt (W)'], [true, 'kWh per intervall']] as const).map(([g, label]) => (
              <Link key={label} href={href('forbrukning', period, g)} aria-current={kwhChart === g ? 'page' : undefined}
                className={`flex min-h-10 items-center rounded-full px-4 font-extrabold ${kwhChart === g ? 'bg-sun text-ink' : 'bg-glass-hi'}`}>
                {label}
              </Link>
            ))}
          </div>
          {kwhChart
            ? used ? <HistoryChart series={[used]} unit=" kWh" decimals={2} bars longPeriod={longPeriod} fit={480} />
              : <p className="p-10 text-center text-lg font-bold text-dim">Ingen mätardata för perioden.</p>
            : total ? <HistoryChart series={[total]} unit=" W" decimals={0} bars={false} longPeriod={longPeriod} fit={480} />
              : <p className="p-10 text-center text-lg font-bold text-dim">Ingen effektdata för perioden.</p>}
        </div>
        <div className="flex flex-col gap-1.5 rounded-[24px] glass p-3">
          <h2 className="text-xl font-extrabold">Drar mest nu</h2>
          {top.length ? top.map((x) => (
            <div key={x.id} className="flex items-center justify-between gap-3 rounded-[14px] bg-glass-hi px-3 py-1.5">
              <span className="truncate font-bold">{x.label}</span>
              <span className="shrink-0 text-lg font-extrabold">{fmtValue('power', x.latest)}</span>
            </div>
          )) : <p className="font-bold text-dim">Inget drar ström just nu.</p>}
        </div>
      </section>
    </>
  );
}

function PriceView({ prices, s, now }: { prices: Price[]; s: ReturnType<typeof summarize>; now: number }) {
  // Timstaplar för i dag och i morgon, en serie per nivå (färg) relativt respektive dygns snitt.
  const shown = prices.filter((p: Price) => dayKey(p.start) >= dayKey(now));
  const dayAvg = new Map<string, number>();
  for (const k of new Set(shown.map((p) => dayKey(p.start)))) dayAvg.set(k, avg(shown.filter((p) => dayKey(p.start) === k)));
  const hours = hourly(shown);
  const series = LEVELS.map((lv) => ({
    id: lv.key,
    label: lv.label,
    color: lv.bar,
    points: hours
      .filter((hp) => levelOf(hp.ore, dayAvg.get(dayKey(hp.start)) ?? hp.ore).key === lv.key)
      .map((hp) => [hp.start / 1000, hp.ore] as [number, number]),
  })).filter((x) => x.points.length);

  return (
    <>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card bg={s.level?.bg ?? 'var(--color-glass)'} icon="money" label={`Nu${s.level ? ` · ${s.level.label}` : ''}`} value={fmtOre(s.now?.ore)} sub={s.now ? `${hhmm(s.now.start)}–${hhmm(s.now.end)}` : 'Priser saknas'} />
        <Card bg="var(--color-glass)" icon="chart" label="Snitt i dag" value={fmtOre(s.todayAvg || null)} sub="per kWh" />
        <Card bg={tint('#34C27A')} icon="moon" label="Lägst i dag" value={fmtOre(s.todayMin?.ore)} sub={s.todayMin ? `kl ${hhmm(s.todayMin.start)}` : '–'} />
        <Card bg={tint('#F0503C')} icon="bolt" label="Högst i dag" value={fmtOre(s.todayMax?.ore)} sub={s.todayMax ? `kl ${hhmm(s.todayMax.start)}` : '–'} />
      </section>

      <section className="rounded-[24px] glass p-3">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-extrabold">Pris per timme</h2>
          <span className="font-bold text-dim">{s.hasTomorrow ? 'I dag och i morgon' : 'I dag · morgondagens priser kommer ca 13'} · spotpris SE3 exkl. moms och nät</span>
        </div>
        {series.length ? (
          <HistoryChart series={series} unit=" öre" decimals={0} bars longPeriod={false} fit={500} />
        ) : (
          <p className="p-10 text-center text-lg font-bold text-dim">Inga priser hämtade än.</p>
        )}
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="flex items-center gap-3 rounded-[22px] glass px-3.5 py-2.5">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-ok-soft text-ok"><Icon name="bolt" size={30} /></span>
          <span className="flex flex-col">
            <span className="font-bold text-dim">Billigaste timmen</span>
            <span className="text-xl leading-tight font-extrabold">{span(s.cheapest1h)}</span>
            <span className="font-bold">{fmtOre(s.cheapest1h?.ore)} i snitt</span>
          </span>
        </div>
        <div className="flex items-center gap-3 rounded-[22px] glass px-3.5 py-2.5">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-ok-soft text-ok"><Icon name="power" size={30} /></span>
          <span className="flex flex-col">
            <span className="font-bold text-dim">Bästa 3 timmarna · tvätt, disk, laddning</span>
            <span className="text-xl leading-tight font-extrabold">{span(s.cheapest3h)}</span>
            <span className="font-bold">{fmtOre(s.cheapest3h?.ore)} i snitt</span>
          </span>
        </div>
      </section>
    </>
  );
}
