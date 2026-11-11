import { HistoryChart } from '@/components/HistoryChart';
import { Icon, type IconName } from '@/components/Icon';
import { loadPrices } from '@/lib/data';
import { tint } from '@/lib/scale';
import { LEVELS, avg, dayKey, fmtOre, hhmm, hourly, levelOf, summarize, type Price } from '@/lib/prices';

export const dynamic = 'force-dynamic';

function Card({ bg, icon, label, value, sub }: { bg: string; icon: IconName; label: string; value: string; sub: string }) {
  return (
    <div className="glass flex flex-col gap-1 rounded-[24px] p-4" style={{ background: bg }}>
      <span className="flex items-center gap-2.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-glass-hi"><Icon name={icon} size={22} /></span>
        <span className="text-[15px] font-bold">{label}</span>
      </span>
      <span className="text-[40px] leading-tight font-extrabold tracking-tight">{value}</span>
      <span className="text-[15px] font-bold">{sub}</span>
    </div>
  );
}

const span = (w: { start: number; end: number } | null) => (w ? `${hhmm(w.start)}–${hhmm(w.end)}` : '–');

export default async function EnergyPage() {
  const prices = await loadPrices();
  const now = Date.now();
  const s = summarize(prices, now);

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
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[32px] leading-tight font-extrabold tracking-tight">Energi</h1>
        <span className="rounded-full glass px-4 py-2 font-bold text-dim">Spotpris SE3 · exkl. moms och nätavgift</span>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card bg={s.level?.bg ?? 'var(--color-glass)'} icon="money" label={`Nu${s.level ? ` · ${s.level.label}` : ''}`} value={fmtOre(s.now?.ore)} sub={s.now ? `${hhmm(s.now.start)}–${hhmm(s.now.end)}` : 'Priser saknas'} />
        <Card bg="var(--color-glass)" icon="chart" label="Snitt i dag" value={fmtOre(s.todayAvg || null)} sub="per kWh" />
        <Card bg={tint('#34C27A')} icon="moon" label="Lägst i dag" value={fmtOre(s.todayMin?.ore)} sub={s.todayMin ? `kl ${hhmm(s.todayMin.start)}` : '–'} />
        <Card bg={tint('#F0503C')} icon="bolt" label="Högst i dag" value={fmtOre(s.todayMax?.ore)} sub={s.todayMax ? `kl ${hhmm(s.todayMax.start)}` : '–'} />
      </section>

      <section className="rounded-[24px] glass p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[22px] font-extrabold">Pris per timme</h2>
          <span className="font-bold text-dim">{s.hasTomorrow ? 'I dag och i morgon' : 'I dag · morgondagens priser kommer ca 13'}</span>
        </div>
        {series.length ? (
          <HistoryChart series={series} unit=" öre" decimals={0} bars longPeriod={false} />
        ) : (
          <p className="p-10 text-center text-lg font-bold text-dim">Inga priser hämtade än.</p>
        )}
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="flex items-center gap-4 rounded-[24px] glass p-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-ok-soft text-ok"><Icon name="bolt" size={30} /></span>
          <span className="flex flex-col">
            <span className="font-bold text-dim">Billigaste timmen</span>
            <span className="text-2xl font-extrabold">{span(s.cheapest1h)}</span>
            <span className="font-bold">{fmtOre(s.cheapest1h?.ore)} i snitt</span>
          </span>
        </div>
        <div className="flex items-center gap-4 rounded-[24px] glass p-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-ok-soft text-ok"><Icon name="power" size={30} /></span>
          <span className="flex flex-col">
            <span className="font-bold text-dim">Bästa 3 timmarna · tvätt, disk, laddning</span>
            <span className="text-2xl font-extrabold">{span(s.cheapest3h)}</span>
            <span className="font-bold">{fmtOre(s.cheapest3h?.ore)} i snitt</span>
          </span>
        </div>
      </section>
    </>
  );
}
