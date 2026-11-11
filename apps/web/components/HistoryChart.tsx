'use client';
import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

type ChartSeries = { id: string; label: string; color: string; points: [number, number][] };

const TZ = 'Europe/Stockholm';
const fmtTime = (s: number, long: boolean) =>
  new Date(s * 1000).toLocaleString('sv-SE', long
    ? { weekday: 'short', day: 'numeric', timeZone: TZ }
    : { hour: '2-digit', minute: '2-digit', timeZone: TZ });

/** Linje- eller stapeldiagram med uPlot. Klick på en serie i förklaringen döljer/visar den. */
export function HistoryChart({ series, unit, decimals, bars, longPeriod }: {
  series: ChartSeries[]; unit: string; decimals: number; bars: boolean; longPeriod: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const xs = [...new Set(series.flatMap((s) => s.points.map((p) => p[0])))].sort((a, b) => a - b);
    const data: uPlot.AlignedData = [
      xs,
      ...series.map((s) => {
        const m = new Map(s.points);
        return xs.map((x) => m.get(x) ?? null);
      }),
    ];
    const fmtY = (v: number) =>
      `${v.toLocaleString('sv-SE', { maximumFractionDigits: Math.abs(v) < 1 && v !== 0 ? 3 : decimals })}${unit}`;
    const axis = { stroke: '#4A5070', font: '600 13px "Plus Jakarta Sans", system-ui', grid: { stroke: '#E3E6EF', width: 1 }, ticks: { show: false } };
    const height = Math.max(260, Math.min(420, window.innerHeight - 420));

    const u = new uPlot({
      width: el.clientWidth,
      height,
      cursor: { points: { size: 10 } },
      legend: { live: true },
      // Staplar börjar alltid på noll.
      scales: { x: { time: true }, y: bars ? { range: (_u, _min, max) => [0, (max || 1) * 1.1] } : {} },
      axes: [
        {
          ...axis,
          // Hela dagar på långa perioder, annars jämna timmar.
          incrs: longPeriod ? [86400, 2 * 86400, 7 * 86400] : [900, 1800, 3600, 2 * 3600, 3 * 3600, 6 * 3600],
          values: (_u, splits) => splits.map((s) => fmtTime(s, longPeriod)),
        },
        { ...axis, size: 96, values: (_u, splits) => splits.map(fmtY) },
      ],
      series: [
        { label: 'Tid', value: (_u, v) => (v == null ? '–' : fmtTime(v, false) + (longPeriod ? ` ${fmtTime(v, true)}` : '')) },
        ...series.map((s) => ({
          label: s.label,
          stroke: s.color,
          width: bars ? 0 : 3,
          fill: bars ? s.color : undefined,
          spanGaps: true,
          points: { show: false },
          paths: bars ? uPlot.paths.bars!({ size: [0.7, 60] }) : undefined,
          value: (_u: uPlot, v: number | null) => (v == null ? '–' : fmtY(v)),
        })),
      ],
    }, data, el);

    const ro = new ResizeObserver(() => u.setSize({ width: el.clientWidth, height }));
    ro.observe(el);
    return () => {
      ro.disconnect();
      u.destroy();
    };
  }, [series, unit, decimals, bars, longPeriod]);

  return <div ref={ref} className="history-chart w-full" />;
}
