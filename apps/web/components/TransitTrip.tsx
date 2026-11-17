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
export function TransitTripCard({ trip, trains, first, home = false }: { trip: TransitTrip; trains: Train[]; first: boolean; home?: boolean }) {
  const { delay, canceled } = tripDelay(trip, trains);
  const total = Math.round((trip.arr - trip.dep) / 60_000);
  // Serverrenderat per sidvisning (sidan är dynamisk), så "om X min" stämmer när sidan laddas.
  const leaveIn = Math.round((trip.dep - Date.now()) / 60_000);
  return (
    <section className={`flex flex-col gap-2 rounded-2xl glass p-4 ${first ? '' : 'border border-line'}`}>
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="text-[1.375rem] font-extrabold tabular-nums">{leaveIn <= 0 ? 'Gå nu' : `Gå om ${leaveIn} min`}</span>
        <span className="text-[0.9375rem] text-dim tabular-nums">kl {hhmm(trip.dep)}</span>
        <span className="text-[1.0625rem] font-semibold">
          {home ? 'hemma' : 'framme'} {delay ? <>ca <span style={{ color: TONE_COLOR.warn }}>{hhmm(trip.arr + delay * 60_000)}</span></> : hhmm(trip.arr)}
        </span>
        <span className="ml-auto text-[0.875rem] text-dim">{dur(total)}</span>
      </div>
      {canceled && <p className="text-[0.9375rem] font-bold" style={{ color: TONE_COLOR.bad }}>Ett tåg på resan är inställt – välj nästa resa.</p>}
      <TransitLegs trip={trip} trains={trains} />
    </section>
  );
}

/** Benen i en resa (gång, buss, tåg, SL) med spår och tågens realtid. `compact` för kortet på Hem. */
export function TransitLegs({ trip, trains, compact = false }: { trip: TransitTrip; trains: Train[]; compact?: boolean }) {
  return (
      <ol className={`flex flex-col ${compact ? 'gap-0.5' : 'gap-1'}`}>
        {trip.legs.map((l, i) => {
          const rt = legRealtime(l, trains);
          return (
            <li key={i} className="flex min-w-0 items-baseline gap-3">
              <span className={`w-12 shrink-0 ${compact ? 'text-[0.875rem]' : 'text-[1rem]'} font-bold tabular-nums`}>{hhmm(l.dep)}</span>
              <span className="w-14 shrink-0 rounded-md bg-white/[0.08] px-1.5 text-center text-[0.75rem] font-bold uppercase">{KIND[l.kind]}</span>
              <span className={`min-w-0 grow truncate ${compact ? 'text-[0.875rem]' : 'text-[0.9375rem]'}`}>
                {l.kind === 'walk'
                  ? <>{l.minutes} min → {l.to}</>
                  : <><span className="font-semibold">{l.label}</span> → {l.to}{l.track ? <span className="text-dim"> · spår {l.track}</span> : null}</>}
              </span>
              {rt && (rt.canceled || rt.delay > 0) && (
                <span className="shrink-0 text-[0.875rem] font-bold" style={{ color: rt.canceled ? TONE_COLOR.bad : TONE_COLOR.warn }}>
                  {rt.canceled ? 'Inställt' : `+${rt.delay} min`}
                </span>
              )}
            </li>
          );
        })}
      </ol>
  );
}
