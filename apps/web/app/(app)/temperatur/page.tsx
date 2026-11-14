import { Icon } from '@/components/Icon';
import { TrendArrow } from '@/components/TrendArrow';
import { loadCommute, loadHistory, loadHome, loadWeather } from '@/lib/data';
import type { Series } from '@/lib/history';
import { compass } from '@/lib/home';
import { fmtTemp } from '@/lib/scale';

export const dynamic = 'force-dynamic';

/** Samma komfortspann som på Hem: utanför lyfts fram i färg. */
const COMFORT = { low: 18, high: 26 };
const tone = (t: number | null) => (t == null ? undefined : t >= COMFORT.high ? '#F85149' : t < COMFORT.low ? '#4FA3FF' : undefined);
const n1 = (v: number) => v.toLocaleString('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const card = 'flex min-w-0 flex-col gap-3 rounded-[20px] bg-card p-5 lg:p-6';
const h2 = 'flex items-center gap-2.5 text-[18px] font-semibold text-dim';

/** 24 h-kurva med min/max-skala per givare. */
function Curve({ points, color = '#8B98A5', className = 'h-9 w-24' }: { points: [number, number][]; color?: string; className?: string }) {
  if (points.length < 2) return null;
  const xs = points.map((p) => p[0]); const ys = points.map((p) => p[1]);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)]; const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const d = points.map(([x, y], i) => `${i ? 'L' : 'M'}${((x - x0) / (x1 - x0 || 1)) * 100},${28 - ((y - y0) / (y1 - y0 || 1)) * 26}`).join(' ');
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className={`shrink-0 ${className}`} aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** En givare: namn, 24 h min–max och fukt, kurva, värdet högerställt. */
function SensorRow({ s, hum }: { s: Series; hum: number | null }) {
  const c = tone(s.latest);
  return (
    <li className="flex min-h-[64px] items-center gap-3 border-b border-line py-2 last:border-b-0">
      <span className="flex min-w-0 grow flex-col leading-tight">
        <span className="truncate text-[17px] font-semibold">{s.label}</span>
        <span className="truncate text-[15px] text-dim">
          {s.min != null && s.max != null ? `Min ${n1(s.min)}° · max ${n1(s.max)}°` : '–'}
        </span>
      </span>
      <Curve points={s.points} color={c ?? '#8B98A5'} className="h-9 w-16 sm:w-20" />
      <span className="flex w-[76px] shrink-0 flex-col items-end leading-none">
        <span className="text-[28px] font-bold tracking-tight tabular-nums" style={{ color: c }}>{s.latest != null ? `${n1(s.latest)}°` : '–'}</span>
        {hum != null && <span className="mt-1 text-[14px] text-dim tabular-nums">{Math.round(hum)} % fukt</span>}
      </span>
    </li>
  );
}

export default async function TemperaturePage() {
  const [h, weather, commute, temps, hums] = await Promise.all([
    loadHome(), loadWeather(), loadCommute().catch(() => null),
    loadHistory('temp', '24h').catch(() => [] as Series[]), loadHistory('hum', '24h').catch(() => [] as Series[]),
  ]);
  const humOf = new Map(hums.map((x) => [x.id, x.latest]));

  // Ute: egen väderstation i Homey, annars Trafikverkets station, annars SMHI (samma ordning som Hem).
  const tvs = commute?.station ?? null;
  const smhi = weather && Number.isFinite(weather.current.temp) ? Math.round(weather.current.temp * 10) / 10 : null;
  const out = h.outdoorTemp ?? tvs?.air ?? smhi;
  const source = h.outdoorTemp != null ? 'Egen väderstation' : tvs?.air != null ? `Trafikverket · ${tvs.name}` : smhi != null ? (weather?.source ?? 'Prognos') : null;
  const station = h.station ?? (tvs ? { wind: tvs.wind, gust: tvs.gust, dir: tvs.deg != null ? compass(tvs.deg) : null, road: tvs.road } : null);
  const outSeries = temps.find((x) => x.label === 'Ute');
  const fc = weather?.hours.map((x) => x.temp).filter(Number.isFinite) ?? [];

  const inside = temps.filter((x) => x.label !== 'Ute');
  const vals = inside.map((x) => x.latest).filter((v): v is number => v != null);
  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  const dead = h.rooms.filter((r) => r.tempStale);

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-12 lg:items-start lg:gap-6">
      <h1 className="text-[28px] leading-tight font-bold tracking-tight lg:col-span-12">Temperatur</h1>

      {/* UTE */}
      <section aria-label="Ute" className={`${card} lg:col-span-4`}>
        <h2 className={h2}><Icon name="thermo" size={22} />Ute{source ? ` · ${source}` : ''}</h2>
        <div className="flex items-end justify-between gap-3">
          <span className="text-[64px] leading-none font-bold tracking-tight tabular-nums">
            {fmtTemp(out, h.outdoorStale)}<TrendArrow trend={h.outdoorTrend} />
          </span>
          {outSeries && <Curve points={outSeries.points} className="h-12 w-28" />}
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[16px]">
          {outSeries?.min != null && outSeries.max != null && (<><dt className="text-dim">Senaste 24 h</dt><dd className="text-right font-semibold tabular-nums">{n1(outSeries.min)}–{n1(outSeries.max)}°</dd></>)}
          {fc.length > 0 && (<><dt className="text-dim">Prognos 24 h</dt><dd className="text-right font-semibold tabular-nums">{n1(Math.min(...fc))}–{n1(Math.max(...fc))}°</dd></>)}
          {smhi != null && source !== (weather?.source ?? 'Prognos') && (<><dt className="text-dim">{weather?.source ?? 'Prognos'} nu</dt><dd className="text-right font-semibold tabular-nums">{n1(smhi)}°</dd></>)}
          {station?.road != null && (<><dt className="text-dim">Vägbana</dt><dd className="text-right font-semibold tabular-nums">{n1(station.road)}°</dd></>)}
          {station?.wind != null && (<><dt className="text-dim">Vind</dt><dd className="text-right font-semibold tabular-nums">{n1(station.wind)}{station.gust != null ? ` (${n1(station.gust)})` : ''} m/s{station.dir ? ` ${station.dir}` : ''}</dd></>)}
          {humOf.get(outSeries?.id ?? '') != null && (<><dt className="text-dim">Luftfuktighet</dt><dd className="text-right font-semibold tabular-nums">{Math.round(humOf.get(outSeries!.id)!)} %</dd></>)}
        </dl>
      </section>

      {/* INNE */}
      <section aria-label="Inne" className={`${card} lg:col-span-8`}>
        <h2 className={`${h2} justify-between`}>
          <span className="flex items-center gap-2.5"><Icon name="home" size={22} />Inne · {inside.length} givare</span>
          {avg != null && <span className="text-fg"><span className="text-[22px] font-bold tabular-nums">{n1(avg)}°</span> <span className="text-[15px] font-normal text-dim">snitt</span></span>}
        </h2>
        {inside.length ? (
          <ul className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
            {inside.map((s) => <SensorRow key={s.id} s={s} hum={humOf.get(s.id) ?? null} />)}
          </ul>
        ) : <p className="text-[16px] text-dim">Inga temperaturgivare med värden.</p>}
        {dead.length > 0 && (
          <p className="flex items-center gap-2 text-[15px] text-dim">
            <span className="size-2 rounded-full bg-danger" />Ej nåbara: {dead.map((r) => r.name).join(', ')}
          </p>
        )}
        <p className="text-[14px] text-dim">Kurvor, min och max: senaste 24 h. Rött ≥ {COMFORT.high}°, blått under {COMFORT.low}°.</p>
      </section>
    </div>
  );
}
