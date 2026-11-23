import type { Train } from '@/lib/commute';
import { TONE_COLOR } from '@/lib/commute';
import { hhmm } from '@/lib/prices';
import { fmtMeters, lineBadge } from '@/lib/transit-view';
import type { Progress, TransitLeg, TransitTrip } from '@/lib/transit';
import { LeaveIn } from './LeaveIn';

const KIND: Record<TransitLeg['kind'], string> = { walk: 'Gå', train: 'Tåg', bus: 'Buss', metro: 'T-bana', tram: 'Spårv', other: 'Resa' };
/** Linjesymboler för färdsätt (följer textfärgen). */
const LEG_ICON: Record<TransitLeg['kind'], React.ReactNode> = {
  walk: <><circle cx="13" cy="4.5" r="1.7" /><path d="M13 8.5v5l-3 7M13 13.5l3 3 1 4.5M13 9l-3.5 2-1 3M13 9l3 2.5 2.5.5" /></>,
  train: <><rect x="5" y="3" width="14" height="14" rx="3" /><path d="M5 11h14M9 21l2-4M15 21l-2-4" /><circle cx="9" cy="14" r=".7" /><circle cx="15" cy="14" r=".7" /></>,
  metro: <><circle cx="12" cy="12" r="9" /><path d="M7.5 8.5h9M12 8.5V16" /></>,
  tram: <><path d="M8 2.5l8 2M12 3.5V6" /><rect x="5" y="6" width="14" height="11" rx="2.5" /><path d="M5 12h14M8 21l1.5-4M16 21l-1.5-4" /></>,
  bus: <><rect x="4" y="3" width="16" height="14" rx="2.5" /><path d="M4 11h16M7 21v-4M17 21v-4" /><circle cx="8" cy="14" r=".7" /><circle cx="16" cy="14" r=".7" /></>,
  other: <path d="M5 12h14M13 6l6 6-6 6" />,
};
function LegIcon({ kind, size = 20 }: { kind: TransitLeg['kind']; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={`${size / 16}rem`} height={`${size / 16}rem`} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {LEG_ICON[kind]}
    </svg>
  );
}
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

/** "13:58 från Årstadal": första fordonets avgång och hållplats, som i SL-appen. Inget om resan bara är gång. */
export function DepartsFrom({ trip }: { trip: TransitTrip }) {
  const ride = trip.legs.find((l) => l.kind !== 'walk');
  if (!ride) return null;
  return <p className="text-[0.9375rem] text-dim"><span className="font-semibold tabular-nums text-fg">{hhmm(ride.dep)}</span> från {ride.from}</p>;
}

/** En kollektivresa: avresa, ankomst och benen (gång, buss, tåg, SL) med spår och tågens realtid. */
export function TransitTripCard({ trip, trains, first, home = false, ongoing = false, pos }: { trip: TransitTrip; trains: Train[]; first: boolean; home?: boolean; ongoing?: boolean; pos?: Progress }) {
  const { delay, canceled } = tripDelay(trip, trains);
  const total = Math.round((trip.arr - trip.dep) / 60_000);
  // Nedräkningen tickar i klienten (LeaveIn); serverns tid är startvärdet.
  const serverNow = Date.now();
  return (
    <section className={`flex flex-col gap-2 rounded-2xl glass p-4 ${first ? '' : 'border border-line'}`}>
      <div className="flex flex-wrap items-baseline gap-x-3">
        {ongoing
          ? <span className="text-[1.375rem] font-extrabold">Pågående resa</span>
          : pos?.waiting
            // Positionen är kvar vid startpunkten fast avgångstiden passerat.
            ? <span className="text-[1.375rem] font-extrabold" style={{ color: TONE_COLOR.warn }}>Du har inte gått än</span>
            : <LeaveIn dep={trip.dep} serverNow={serverNow} variant="card" />}
        <span className="text-[1.0625rem] font-semibold">
          {home ? 'hemma' : 'framme'} {delay ? <>ca <span style={{ color: TONE_COLOR.warn }}>{hhmm(trip.arr + delay * 60_000)}</span></> : hhmm(trip.arr)}
        </span>
        <span className="ml-auto text-[0.875rem] text-dim">{dur(total)}</span>
      </div>
      {canceled && <p className="text-[0.9375rem] font-bold" style={{ color: TONE_COLOR.bad }}>Ett tåg på resan är inställt – välj nästa resa.</p>}
      <DepartsFrom trip={trip} />
      <TransitLegs trip={trip} trains={trains} pos={pos} />
    </section>
  );
}

/**
 * Benen i en resa (gång, buss, tåg, SL) med spår och tågens realtid. `compact` för kortet på Hem.
 * Pågående delsträcka markeras ("Nu"), avklarade får ✓ och blir grå. Utan `pos` styr klockan (planer som räknats från nu).
 * Med `pos` styr positionen: ✓ bara för sträckor som positionen bekräftar, och varken ✓ eller "Nu" utan färsk position
 * eller när man inte gått än.
 */
export function TransitLegs({ trip, trains, compact = false, now = Date.now(), pos }: { trip: TransitTrip; trains: Train[]; compact?: boolean; now?: number; pos?: Progress }) {
  const byPos = pos !== undefined;
  const current = !byPos ? trip.legs.findIndex((l) => l.dep <= now && now < l.arr)
    : pos.known && !pos.waiting ? trip.legs.findIndex((l, i) => i >= pos.done && l.dep <= now && now < l.arr) : -1;
  return (
      <ol className={`flex flex-col ${compact ? 'gap-0.5' : 'gap-1'}`}>
        {trip.legs.map((l, i) => {
          const rt = legRealtime(l, trains);
          const badge = lineBadge(l);
          const live = i === current;
          const done = byPos ? i < pos.done : l.arr <= now;
          return (
            <li key={i} aria-current={live ? 'step' : undefined}
              className={`flex min-w-0 items-center gap-2 ${live ? '-mx-1.5 rounded-lg bg-white/[0.14] px-1.5 py-0.5 ring-1 ring-sun/60' : ''} ${done && !live ? 'text-dim' : ''}`}>
              <span className={`w-12 shrink-0 ${compact ? 'text-[0.875rem]' : 'text-[1rem]'} font-bold tabular-nums`}>{hhmm(l.dep)}</span>
              {/* Färdsätt som symbol (skärmläsare får ordet); starttid före, sluttid efter. */}
              <span role="img" aria-label={`${KIND[l.kind]}${done && !live ? ', avklarad' : ''}`} className={`relative flex shrink-0 items-center justify-center rounded-lg ${compact ? 'size-7' : 'size-8'} ${live ? 'bg-sun text-ink' : 'bg-white/[0.08]'}`}>
                <LegIcon kind={l.kind} size={compact ? 18 : 20} />
                {/* Avklarad delsträcka: grön bock i hörnet. */}
                {done && !live && <span aria-hidden className="absolute -right-1 -top-1 flex size-3.5 items-center justify-center rounded-full bg-ok text-[0.5625rem] font-black leading-none text-ink">✓</span>}
              </span>
              <span className={`min-w-0 grow truncate ${compact ? 'text-[0.875rem]' : 'text-[0.9375rem]'}`}>
                {l.kind === 'walk'
                  // Sträckan i meter som i SL (tiderna på sidorna visar redan hur lång tid det tar).
                  ? <><span title={`${l.minutes} min`}>{l.meters != null ? fmtMeters(l.meters) : `${l.minutes} min`}</span> → {l.to}</>
                  : <>{badge
                      ? <><span className="mr-0.5 inline-flex min-w-7 justify-center rounded-md px-1.5 align-middle text-[0.8125rem] leading-5 font-extrabold text-white" style={{ background: badge.color }} aria-hidden>{badge.text}</span><span className="sr-only">{l.label}</span></>
                      : <span className="font-semibold">{l.label}</span>} → {l.to}{l.track && !done ? <span className="text-dim"> · spår {l.track}</span> : null}</>}
              </span>
              {!live && rt && (rt.canceled || rt.delay > 0) && (
                <span className="shrink-0 text-[0.875rem] font-bold" style={{ color: rt.canceled ? TONE_COLOR.bad : TONE_COLOR.warn }}>
                  {rt.canceled ? 'Inställt' : `+${rt.delay} min`}
                </span>
              )}
              <span className={`w-12 shrink-0 text-right ${compact ? 'text-[0.875rem]' : 'text-[1rem]'} font-bold tabular-nums ${live ? 'text-sun' : ''}`}>{hhmm(l.arr)}</span>
            </li>
          );
        })}
      </ol>
  );
}
