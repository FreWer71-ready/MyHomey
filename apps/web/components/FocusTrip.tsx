import type { Train } from '@/lib/commute';
import type { FocusTrip } from '@/lib/focus-trip';
import type { Progress } from '@/lib/transit';
import { TransitTripCard } from './TransitTrip';
import { ClearFocusButton } from './FocusTripButton';
import { TrainProgress, TrainRoute } from './TrainProgress';
import { LegOnTrain } from './OnTrainButton';
import { savedLegs } from '@/lib/trips-source';

/** Dagens resa (vald i Sök resa): ersätter pendlingsförslagen. Avklarade sträckor enligt positionen, "Släpp resan" återställer. */
export async function FocusTripCard({ focus, trains, pos, className = '' }: { focus: FocusTrip; trains: Train[]; pos?: Progress; className?: string }) {
  // Tågen i resan (Trafikverkets tågnummer): var det pågående tåget är och "Sträckan" för varje tåg.
  const now = Date.now();
  const rail = focus.legs.filter((l) => l.kind === 'train' && !!l.num && /^\d{1,6}$/.test(l.num));
  const onboard = rail.find((l) => l.dep <= now && now < l.arr);
  // Tåg som du bekräftat (bockat) sparas i tåghistoriken; här visas vilka som redan är sparade.
  const saved = await savedLegs(rail.map((l) => ({ ident: l.num!, dep: l.dep })));
  const action = rail.length > 0 && (
    <div className="flex flex-col gap-2 border-t border-line pt-2">
      {onboard && <TrainProgress ident={onboard.num!} />}
      <div className="flex flex-wrap items-center gap-2">
        {rail.map((l) => (
          <span key={`${l.num}-${l.dep}`} className="flex flex-wrap items-center gap-2">
            <TrainRoute ident={l.num!} label={`Sträckan ${l.num} ›`} />
            <LegOnTrain leg={l} saved={saved.has(`${l.num}|${l.dep}`)} />
          </span>
        ))}
      </div>
    </div>
  );
  return (
    <section aria-label={`Dagens resa till ${focus.to}`} className={`flex flex-col gap-2 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="min-w-0 truncate text-[1.125rem] font-bold">Dagens resa · {focus.home ? 'hem' : focus.to}</h2>
        <ClearFocusButton />
      </div>
      <TransitTripCard trip={{ dep: focus.dep, arr: focus.arr, legs: focus.legs, startAt: null, endAt: null }} trains={trains} first home={focus.home} pos={pos} action={action || undefined} />
    </section>
  );
}
