import Link from 'next/link';
import { HistoryChart } from '@/components/HistoryChart';
import { Icon, type IconName } from '@/components/Icon';
import { loadHistory, loadHome, loadPriceHistory, loadPrices } from '@/lib/data';
import { PERIODS, fmtValue, sumSeries, type PeriodKey } from '@/lib/history';
import { fmtWatt, tint } from '@/lib/scale';
import { LEVELS, VAT, avg, compareFixed, dayKey, fixedPriceOre, fmtOre, hhmm, hourly, levelOf, summarize, type Price } from '@/lib/prices';

export const dynamic = 'force-dynamic';

function Card({ bg, icon, label, value, sub }: { bg: string; icon: IconName; label: string; value: string; sub: string }) {
  return (
    <div className="glass flex flex-col gap-0.5 rounded-[1.375rem] px-3.5 py-3" style={{ background: bg }}>
      <span className="flex items-center gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-glass-hi"><Icon name={icon} size={20} /></span>
        <span className="text-[0.9375rem] font-bold">{label}</span>
      </span>
      <span className="text-[2.125rem] leading-tight font-extrabold tracking-tight">{value}</span>
      <span className="text-[0.9375rem] font-bold">{sub}</span>
    </div>
  );
}

type View = 'pris' | 'forbrukning';
const USE_PERIODS: PeriodKey[] = ['4h', '12h', '24h', '7d'];
const chip = (active: boolean) => `pill ${active ? 'on' : ''}`;
const kwh = (v: number | null) => (v == null ? '–' : `${v.toLocaleString('sv-SE', { maximumFractionDigits: v < 10 ? 2 : 1 })} kWh`);

const span = (w: { start: number; end: number } | null) => (w ? `${hhmm(w.start)}–${hhmm(w.end)}` : '–');

export default async function EnergyPage({ searchParams }: { searchParams: Promise<{ vy?: string; p?: string; g?: string }> }) {
  const q = await searchParams;
  const period: PeriodKey = USE_PERIODS.includes(q.p as PeriodKey) ? (q.p as PeriodKey) : '24h';
  // Fast elpris (FIXED_PRICE_ORE): pris-vyn jämför rörligt mot det i stället för mot dygnets snitt.
  const fixed = fixedPriceOre();
  const [prices, h, history] = await Promise.all([loadPrices(), loadHome(), fixed ? loadPriceHistory(360).catch(() => []) : Promise.resolve([])]);
  // Förbrukning visas bara när hemmet har något som mäter eller uppskattar effekt (t.ex. inte i Hue-hushåll).
  const hasUse = h.powerMeters + h.powerEstimated > 0;
  const view: View = hasUse && q.vy === 'forbrukning' ? 'forbrukning' : 'pris';
  const now = Date.now();
  const s = summarize(prices, now);
  const kwhChart = q.g === 'kwh';
  const href = (v: View, pp: PeriodKey = period, g = kwhChart) => `/energi?vy=${v}${v === 'forbrukning' ? `&p=${pp}${g ? '&g=kwh' : ''}` : ''}`;

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[2rem] leading-tight font-extrabold tracking-tight">Energi</h1>
          {hasUse && <nav aria-label="Vy" className="flex gap-1.5">
            <Link href={href('pris')} aria-current={view === 'pris' ? 'page' : undefined} className={chip(view === 'pris')}>
              <Icon name="money" size={20} /> Elpris
            </Link>
            <Link href={href('forbrukning')} aria-current={view === 'forbrukning' ? 'page' : undefined} className={chip(view === 'forbrukning')}>
              <Icon name="bolt" size={20} /> Förbrukning
            </Link>
          </nav>}
        </div>
        {/* Den andra vyns nyckeltal, tydligt och klickbart. */}
        {!hasUse ? null : view === 'pris' ? (
          <Link href={href('forbrukning')} className="glass flex items-center gap-3 rounded-[1.25rem] py-2 pr-5 pl-2" style={{ background: tint('#8B5CF6', 0.5) }}>
            <span className="flex size-11 items-center justify-center rounded-[0.875rem] bg-glass-hi"><Icon name="bolt" size={24} /></span>
            <span className="flex flex-col leading-tight">
              <span className="text-[0.8125rem] font-bold tracking-wider uppercase">Effekt nu</span>
              <span className="text-2xl font-extrabold">{fmtWatt(h.powerW)}</span>
            </span>
          </Link>
        ) : (
          <Link href={href('pris')} className="glass flex items-center gap-3 rounded-[1.25rem] py-2 pr-5 pl-2" style={{ background: s.level?.bg ?? 'var(--color-glass)' }}>
            <span className="flex size-11 items-center justify-center rounded-[0.875rem] bg-glass-hi"><Icon name="money" size={24} /></span>
            <span className="flex flex-col leading-tight">
              <span className="text-[0.8125rem] font-bold tracking-wider uppercase">Elpris nu{s.level ? ` · ${s.level.label}` : ''}</span>
              <span className="text-2xl font-extrabold">{fmtOre(s.now?.ore)}</span>
            </span>
          </Link>
        )}
      </header>

      {view === 'pris' ? (fixed ? <FixedPriceView prices={prices} history={history} fixed={fixed} now={now} /> : <PriceView prices={prices} s={s} now={now} />) : <UseView period={period} powerW={h.powerW} meters={h.powerMeters} estimated={h.powerEstimated} href={href} kwhChart={kwhChart} />}
    </>
  );
}

async function UseView({ period, powerW, meters, estimated, href, kwhChart }: { period: PeriodKey; powerW: number; meters: number; estimated: number; href: (v: View, p?: PeriodKey, g?: boolean) => string; kwhChart: boolean }) {
  const [power, energy] = await Promise.all([loadHistory('power', period), loadHistory('energy', period)]);
  const total = power.length ? sumSeries(power, 'Effekt totalt', '#8B5CF6') : null;
  const used = energy.length ? sumSeries(energy, 'Förbrukning', '#2BB5C4') : null;
  // Alla mätare, störst först. Andel av total effekt visas som stapel.
  const top = [...power].sort((a, b) => (b.latest ?? 0) - (a.latest ?? 0));
  const sumNow = top.reduce((a, x) => a + Math.max(0, x.latest ?? 0), 0);
  const avgW = total?.points.length ? total.points.reduce((a, p) => a + p[1], 0) / total.points.length : null;
  const longPeriod = period === '7d';

  return (
    <>
      <nav aria-label="Period" className="flex flex-wrap gap-1.5">
        {USE_PERIODS.map((k) => (
          <Link key={k} href={href('forbrukning', k)} aria-current={k === period ? 'page' : undefined}
            className={`pill ${k === period ? 'on' : ''}`}>
            {PERIODS[k].label}
          </Link>
        ))}
      </nav>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card bg={tint('#8B5CF6', 0.5)} icon="bolt" label="Effekt nu" value={fmtWatt(powerW)} sub={[meters && `${meters} mätare`, estimated && `${estimated} uppskattade`].filter(Boolean).join(' · ')} />
        <Card bg={tint('#2BB5C4', 0.5)} icon="chart" label={`Förbrukat ${PERIODS[period].label}`} value={kwh(used?.total ?? null)} sub="uppmätt, utan uppskattningar" />
        <Card bg="var(--color-glass)" icon="power" label="Snitteffekt" value={avgW == null ? '–' : fmtWatt(Math.round(avgW))} sub={PERIODS[period].label} />
        <Card bg={tint('#F0503C')} icon="bolt" label="Högsta effekt" value={total?.max == null ? '–' : fmtWatt(Math.round(total.max))} sub={PERIODS[period].label} />
      </section>

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-[2fr_1fr]">
        <div className="min-w-0 rounded-[1.5rem] glass p-3">
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
        {/* Panelen tar grafens höjd på plattan (absolut inuti) och listan scrollar om den är längre. */}
        <div className="relative min-h-60 lg:min-h-0">
          <div className="flex flex-col gap-1.5 rounded-[1.5rem] glass p-3 lg:absolute lg:inset-0">
            <h2 className="flex items-baseline justify-between gap-2 text-xl font-extrabold">
              Drar mest nu <span className="text-sm font-bold text-dim">{top.length} enheter</span>
            </h2>
            {top.length ? (
              <ul className="-mr-1 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1">
                {top.map((x) => {
                  const w = Math.max(0, x.latest ?? 0);
                  return (
                    <li key={x.id} className={`relative shrink-0 overflow-hidden rounded-[0.75rem] bg-glass-hi px-3 py-1 ${w < 0.5 ? 'text-dim' : ''}`}>
                      <span className="absolute inset-y-0 left-0 bg-violet/25" style={{ width: `${sumNow ? (w / sumNow) * 100 : 0}%` }} />
                      <span className="relative flex items-center justify-between gap-3">
                        <span className="truncate font-bold">{x.label}</span>
                        <span className="shrink-0 font-extrabold" title={x.estimated ? 'Homeys uppskattning' : 'Uppmätt'}>{x.estimated ? '≈ ' : ''}{fmtValue('power', x.latest)}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="font-bold text-dim">Ingen effektdata.</p>}
          </div>
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

      <section className="rounded-[1.5rem] glass p-3">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-extrabold">Pris per timme</h2>
          <span className="font-bold text-dim">{s.hasTomorrow ? 'I dag och i morgon' : 'I dag · morgondagens priser kommer ca 13'} · spotpris SE3 exkl. moms och nät</span>
        </div>
        {series.length ? (
          <HistoryChart series={series} unit=" öre" decimals={0} bars longPeriod={false} fit={500} mark={Math.floor(now / 3600_000) * 3600} />
        ) : (
          <p className="p-10 text-center text-lg font-bold text-dim">Inga priser hämtade än.</p>
        )}
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="flex items-center gap-3 rounded-[1.375rem] glass px-3.5 py-2.5">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-ok-soft text-ok"><Icon name="bolt" size={30} /></span>
          <span className="flex flex-col">
            <span className="font-bold text-dim">Billigaste timmen</span>
            <span className="text-xl leading-tight font-extrabold">{span(s.cheapest1h)}</span>
            <span className="font-bold">{fmtOre(s.cheapest1h?.ore)} i snitt</span>
          </span>
        </div>
        <div className="flex items-center gap-3 rounded-[1.375rem] glass px-3.5 py-2.5">
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

/** Fast pris: rörligt (spot inkl. moms) jämfört med det fasta priset, nu, per timme och över perioder. */
function FixedPriceView({ prices, history, fixed, now }: { prices: Price[]; history: Price[]; fixed: number; now: number }) {
  const cur = prices.find((p) => p.start <= now && now < p.end) ?? null;
  const curVar = cur ? cur.ore * VAT : null;
  const today = prices.filter((p) => dayKey(p.start) === dayKey(now));
  const todayVar = today.length ? avg(today) * VAT : null;
  const maxVar = today.length ? Math.max(...today.map((p) => p.ore)) * VAT : null;
  const green = '#34C27A', red = '#F0503C';
  const vs = (v: number | null) => (v == null ? '–' : v < fixed ? `${Math.round(fixed - v)} öre billigare än fast` : `${Math.round(v - fixed)} öre dyrare än fast`);

  // Timstaplar inkl. moms: gröna under det fasta priset, röda över.
  const hours = hourly(prices.filter((p) => dayKey(p.start) >= dayKey(now)));
  const series = [
    { id: 'under', label: 'Under fast pris', color: green, pick: (o: number) => o < fixed },
    { id: 'over', label: 'Över fast pris', color: red, pick: (o: number) => o >= fixed },
  ].map(({ pick, ...x }) => ({ ...x, points: hours.filter((hp) => pick(hp.ore * VAT)).map((hp) => [hp.start / 1000, hp.ore * VAT] as [number, number]) }))
    .filter((x) => x.points.length);

  // Perioder: hela dygn före i dag som dygnssnitt (historiken), i dag och i morgon från dagens hämtning.
  const merged = [...history, ...prices.filter((p) => dayKey(p.start) >= dayKey(now))];
  const periods = compareFixed(merged, fixed, now);

  return (
    <>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card bg="var(--color-glass)" icon="money" label="Fast pris" value={fmtOre(fixed)} sub="per kWh inkl. moms" />
        <Card bg={curVar == null ? 'var(--color-glass)' : tint(curVar < fixed ? green : red)} icon="bolt" label="Rörligt nu" value={fmtOre(curVar)} sub={vs(curVar)} />
        <Card bg={todayVar == null ? 'var(--color-glass)' : tint(todayVar < fixed ? green : red)} icon="chart" label="Rörligt snitt i dag" value={fmtOre(todayVar)} sub={vs(todayVar)} />
        <Card bg="var(--color-glass)" icon="power" label="Rörligt högst i dag" value={fmtOre(maxVar)} sub={vs(maxVar)} />
      </section>

      <section className="rounded-[1.5rem] glass p-3">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-extrabold">Rörligt per timme</h2>
          <span className="font-bold text-dim">Spotpris SE3 inkl. moms, exkl. nät och påslag · grönt = under fast pris</span>
        </div>
        {series.length ? (
          <HistoryChart series={series} unit=" öre" decimals={0} bars longPeriod={false} fit={500} mark={Math.floor(now / 3600_000) * 3600} />
        ) : (
          <p className="p-10 text-center text-lg font-bold text-dim">Inga priser hämtade än.</p>
        )}
      </section>

      {periods.length > 0 && (
        <section className="flex flex-col gap-1.5 rounded-[1.5rem] glass p-3">
          <h2 className="text-xl font-extrabold">Fast mot rörligt</h2>
          <ul className="flex flex-col gap-1.5">
            {periods.map((x) => {
              const fixedWins = x.diff > 0;
              return (
                <li key={x.key} className="flex flex-wrap items-baseline justify-between gap-x-3 rounded-[0.875rem] px-3 py-2" style={{ background: tint(fixedWins ? green : red, 0.35) }}>
                  <span className="font-bold">{x.label}</span>
                  <span className="text-dim">rörligt {fmtOre(x.variable)} i snitt</span>
                  <span className="font-extrabold">
                    {fixedWins ? 'Fast billigare' : 'Rörligt billigare'} · {Math.round(Math.abs(x.diff))} öre ({Math.round(Math.abs(x.pct))} %)
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="text-[0.875rem] text-dim">Tidsviktat snitt, inte efter förbrukning. Rörligt räknat som spotpris + 25 % moms, utan elhandlarens påslag.</p>
        </section>
      )}
    </>
  );
}
