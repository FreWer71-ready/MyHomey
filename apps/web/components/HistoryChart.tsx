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
export function HistoryChart({ series, unit, decimals, bars, longPeriod, fit = 420, mark }: {
  series: ChartSeries[]; unit: string; decimals: number; bars: boolean; longPeriod: boolean;
  /** Pixlar som resten av vyn behöver; grafen tar det som blir över (180–420 px). */
  fit?: number;
  /** Markera en tidpunkt (unix-sekunder), t.ex. aktuell timme i elpriset. */
  mark?: number;
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
    const axis = { stroke: '#C3C8D6', font: '600 13px "Plus Jakarta Sans", system-ui', grid: { stroke: 'rgba(255,255,255,0.08)', width: 1 }, ticks: { show: false } };
    const height = Math.max(180, Math.min(420, window.innerHeight - fit));

    const u = new uPlot({
      width: el.clientWidth,
      height,
      cursor: { points: { size: 10 } },
      hooks: mark == null ? {} : {
        // Ram och "Nu" runt markerad stapel/tidpunkt, ovanpå diagrammet.
        draw: [(u: uPlot) => {
          const xs = u.data[0] as number[];
          const step = xs.length > 1 ? xs[1] - xs[0] : 3600;
          const pr = devicePixelRatio;
          const x0 = u.valToPos(mark - step / 2, 'x', true);
          const x1 = u.valToPos(mark + step / 2, 'x', true);
          const { top, height } = u.bbox;
          const c = u.ctx;
          c.save();
          c.fillStyle = 'rgba(255,255,255,0.12)';
          c.fillRect(x0, top, x1 - x0, height);
          c.strokeStyle = '#FFFFFF';
          c.lineWidth = 2.5 * pr;
          c.strokeRect(x0, top, x1 - x0, height);
          c.fillStyle = '#FFFFFF';
          c.font = `800 ${13 * pr}px "Plus Jakarta Sans", system-ui`;
          c.textAlign = 'center';
          c.textBaseline = 'bottom';
          c.fillText('Nu', (x0 + x1) / 2, top - 3 * pr);
          c.restore();
        }],
      },
      legend: { live: true },
      // Staplar börjar alltid på noll.
      scales: { x: { time: true }, y: bars ? { range: (_u, _min, max) => [0, (max || 1) * 1.1] } : {} },
      axes: [
        {
          ...axis,
          // Hela dagar på långa perioder, annars jämna timmar.
          incrs: longPeriod ? [86400, 2 * 86400, 7 * 86400, 14 * 86400, 30 * 86400, 61 * 86400, 91 * 86400] : [900, 1800, 3600, 2 * 3600, 3 * 3600, 6 * 3600],
          // Över ~2 månader: månad och år (t.ex. "okt 25"), annars veckodag/datum eller klockslag.
          values: (u, splits) => {
            const span = (u.scales.x.max ?? 0) - (u.scales.x.min ?? 0);
            return splits.map((s) => span > 60 * 86400
              ? new Date(s * 1000).toLocaleDateString('sv-SE', { month: 'short', year: '2-digit', timeZone: TZ }).replace('.', '')
              : fmtTime(s, longPeriod));
          },
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
  }, [series, unit, decimals, bars, longPeriod, fit, mark]);

  return <div ref={ref} className="history-chart w-full" />;
}
