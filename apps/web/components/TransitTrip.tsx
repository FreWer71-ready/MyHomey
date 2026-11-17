import type { Train } from '@/lib/commute';
import { TONE_COLOR } from '@/lib/commute';
import { hhmm } from '@/lib/prices';
import type { TransitLeg, TransitTrip } from '@/lib/transit';

const KIND: Record<TransitLeg['kind'], string> = { walk: 'Gå', train: 'Tåg', bus: 'Buss', metro: 'T-bana', tram: 'Spårv', other: 'Resa' };
const dur = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`);

/** Trafikverkets realtid för ett tågben (samma tågnummer, avgång inom 30 min). */
export function legRealtime(leg: TransitLeg, trains: Train[]): { delay: number; canceled: boolean } | null {
  if (leg.kind !== 'train' || !leg.num) return null;
  const t = trains.find((x) => x.ident === leg.num && Math.abs(x.dep - leg.dep) < 30 * 60_000);
  return t ? { delay: t.delay, canceled: t.canceled } : null;
}

/** Ungefärlig ankomst med tågens förseningar (byten antas hinnas om förseningen är liten). */
export function tripDelay(trip: TransitTrip, trains: Train[]): { delay: number; canceled: boolean } {
  const rts = trip.legs.map((l) => legRealtime(l, trains)).filter((x): x is { delay: number; canceled: boolean } => !!x);
  return { delay: Math.max(0, ...rts.map((r) => r.delay)), canceled: rts.some((r) => r.canceled) };
}

/** En kollektivresa: avresa, ankomst och benen (gång, buss, tåg, SL) med spår och tågens realtid. */
export function TransitTripCard({ trip, trains, first }: { trip: TransitTrip; trains: Train[]; first: boolean }) {
  const { delay, canceled } = tripDelay(trip, trains);
  const total = Math.round((trip.arr - trip.dep) / 60_000);
  return (
    <section className={`flex flex-col gap-2 rounded-2xl glass p-4 ${first ? '' : 'opacity-80'}`}>
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="text-[22px] font-extrabold tabular-nums">Åk {hhmm(trip.dep)}</span>
        <span className="text-[17px] font-semibold">
          framme {delay ? <>ca <span style={{ color: TONE_COLOR.warn }}>{hhmm(trip.arr + delay * 60_000)}</span></> : hhmm(trip.arr)}
        </span>
        <span className="ml-auto text-[14px] text-dim">{dur(total)}</span>
      </div>
      {canceled && <p className="text-[15px] font-bold" style={{ color: TONE_COLOR.bad }}>Ett tåg på resan är inställt – välj nästa resa.</p>}
      <ol className="flex flex-col gap-1">
        {trip.legs.map((l, i) => {
          const rt = legRealtime(l, trains);
          return (
            <li key={i} className="flex min-w-0 items-baseline gap-3">
              <span className="w-12 shrink-0 text-[16px] font-bold tabular-nums">{hhmm(l.dep)}</span>
              <span className="w-14 shrink-0 rounded-md bg-white/[0.08] px-1.5 text-center text-[12px] font-bold uppercase">{KIND[l.kind]}</span>
              <span className="min-w-0 grow truncate text-[15px]">
                {l.kind === 'walk'
                  ? <>{l.minutes} min → {l.to}</>
                  : <><span className="font-semibold">{l.label}</span> → {l.to}{l.track ? <span className="text-dim"> · spår {l.track}</span> : null}</>}
              </span>
              {rt && (rt.canceled || rt.delay > 0) && (
                <span className="shrink-0 text-[14px] font-bold" style={{ color: rt.canceled ? TONE_COLOR.bad : TONE_COLOR.warn }}>
                  {rt.canceled ? 'Inställt' : `+${rt.delay} min`}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
