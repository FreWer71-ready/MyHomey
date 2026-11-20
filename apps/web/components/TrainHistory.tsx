import Link from 'next/link';
import { TONE_COLOR, station } from '@/lib/commute';
import { hhmm } from '@/lib/prices';
import { CLAIM_MIN, DELAYED_MIN, claimText, claimable, stats, type Trip } from '@/lib/trips';
import { ClaimChips, CopyClaim, DeleteTrip } from './TripButtons';

export const RANGES = { '30d': { label: '30 dagar', days: 30 }, '365d': { label: '1 år', days: 365 }, all: { label: 'Allt', days: Infinity } } as const;
export type RangeKey = keyof typeof RANGES;
export const isRange = (r: string | undefined): r is RangeKey => !!r && r in RANGES;

const date = (ms: number) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', weekday: 'short', day: 'numeric', month: 'short' }).format(ms);
const dur = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${Math.round(min % 60)} min` : `${Math.round(min)} min`);
const num = (v: number, d = 1) => v.toLocaleString('sv-SE', { maximumFractionDigits: d });
const chip = (on: boolean) => `pill ${on ? 'on' : ''}`;

/** Försening som kort text och färg: grön i tid, gul från 5 min, röd från 20 min, grå när den inte är känd. */
function delayBadge(t: Trip): { text: string; color: string | null } {
  if (t.canceled) return { text: 'Inställt', color: TONE_COLOR.bad };
  if (t.delayMin == null) return { text: t.settled ? 'Okänd' : 'Väntar', color: null };
  if (t.delayMin >= CLAIM_MIN) return { text: `+${t.delayMin} min`, color: TONE_COLOR.bad };
  if (t.delayMin >= DELAYED_MIN) return { text: `+${t.delayMin} min`, color: TONE_COLOR.warn };
  return { text: 'I tid', color: TONE_COLOR.ok };
}
const route = (t: Trip) => `${station(t.from)} → ${station(t.to)}`;

/** Historik för tågresor: statistik för vald period, resor att begära ersättning för (alla) och senaste resor. */
export function TrainHistory({ trips, range }: { trips: Trip[]; range: RangeKey }) {
  const since = Date.now() - RANGES[range].days * 86400_000;
  const inRange = trips.filter((t) => t.dep >= since);
  const s = stats(inRange);
  const claims = trips.filter(claimable);
  const open = claims.filter((t) => t.claim === 'none').length;
  const tiles: [string, string, string?][] = [
    ['Resor', String(s.trips)],
    ['Resta mil', `${num(s.mil)} mil`],
    ['Medelförsening', s.known ? `${num(s.avg)} min` : '–'],
    ['Total försening', s.known ? dur(s.total) : '–'],
    ['I tid', String(s.onTime), TONE_COLOR.ok],
    [`${DELAYED_MIN}–${CLAIM_MIN - 1} min sen`, String(s.late), TONE_COLOR.warn],
    [`${CLAIM_MIN} min eller mer`, String(s.claimable), TONE_COLOR.bad],
    ['Inställda', String(s.canceled)],
  ];
  return (
    <>
      <nav aria-label="Period" className="scroll-x flex gap-1.5 max-md:-mx-3 max-md:overflow-x-auto max-md:px-3 md:flex-wrap">
        {(Object.keys(RANGES) as RangeKey[]).map((k) => (
          <Link key={k} href={`/historik?m=train&r=${k}`} aria-current={k === range ? 'page' : undefined} className={chip(k === range)}>{RANGES[k].label}</Link>
        ))}
      </nav>

      {trips.length === 0 && (
        <p className="rounded-[1.5rem] glass p-6 text-center text-lg font-bold text-dim">
          Inga tåg sparade än. Tryck &quot;Jag är på tåget&quot; på Pendling så sparas resan här.
        </p>
      )}

      {trips.length > 0 && (
        <section aria-label="Statistik" className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {tiles.map(([k, v, c]) => (
            <div key={k} className="flex flex-col rounded-[1.25rem] glass px-3 py-2">
              <span className="text-[0.875rem] font-bold text-dim">{k}</span>
              <span className="truncate text-2xl leading-tight font-extrabold tabular-nums" style={c ? { color: c } : undefined}>{v}</span>
            </div>
          ))}
        </section>
      )}

      <section aria-label="Ersättning" className="flex flex-col gap-2 rounded-[1.5rem] glass p-3">
        <h2 className="flex flex-wrap items-baseline justify-between gap-2 text-xl font-extrabold">
          Begär ersättning
          <span className="text-[0.875rem] font-bold text-dim">{open > 0 ? `${open} att begära` : 'inget att begära'} · försenad {CLAIM_MIN} min eller mer</span>
        </h2>
        {claims.length === 0 && <p className="rounded-2xl bg-glass-2 p-3 font-bold text-dim">Inga resor med {CLAIM_MIN} minuters försening eller mer.</p>}
        <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {claims.map((t) => (
            <li key={`${t.ident}-${t.dep}`} className="flex flex-col gap-2 rounded-2xl bg-glass-2 p-3">
              <div className="flex items-baseline gap-2">
                <span className="text-[1.0625rem] font-extrabold">{date(t.dep)}</span>
                <span className="min-w-0 grow truncate text-[0.9375rem] text-dim">{t.product ?? 'Tåg'} {t.ident} · {route(t)}</span>
                <span className="shrink-0 text-[1.0625rem] font-extrabold" style={{ color: TONE_COLOR.bad }}>+{t.delayMin} min</span>
              </div>
              <p className="text-[0.9375rem] tabular-nums">
                Planerad ankomst {hhmm(t.arr)}{t.actualArr != null && <> · faktisk <b>{hhmm(t.actualArr)}</b></>}
              </p>
              <ClaimChips ident={t.ident} dep={t.dep} claim={t.claim} />
              <CopyClaim text={claimText(t)} />
            </li>
          ))}
        </ul>
      </section>

      {inRange.length > 0 && (
        <section aria-label="Resor" className="flex flex-col gap-1.5 rounded-[1.5rem] glass p-3">
          <h2 className="text-xl font-extrabold">Resor</h2>
          <ul className="flex flex-col gap-1">
            {inRange.slice(0, 40).map((t) => {
              const b = delayBadge(t);
              return (
                <li key={`${t.ident}-${t.dep}`} className="flex min-w-0 items-center gap-2">
                  <span className="w-[4.25rem] shrink-0 text-[0.9375rem] font-bold">{date(t.dep)}</span>
                  <span className="min-w-0 grow truncate text-[0.9375rem]">{route(t)} <span className="text-dim">· {t.ident} · {hhmm(t.dep)}</span></span>
                  <span className="shrink-0 text-[0.9375rem] font-bold tabular-nums" style={b.color ? { color: b.color } : undefined}>{b.text}</span>
                  <DeleteTrip ident={t.ident} dep={t.dep} />
                </li>
              );
            })}
          </ul>
          {inRange.length > 40 && <p className="text-[0.875rem] font-bold text-dim">Visar de 40 senaste av {inRange.length}.</p>}
        </section>
      )}
    </>
  );
}
