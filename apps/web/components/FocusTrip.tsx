import type { Train } from '@/lib/commute';
import type { FocusTrip } from '@/lib/focus-trip';
import type { Progress } from '@/lib/transit';
import { TransitTripCard } from './TransitTrip';
import { ClearFocusButton } from './FocusTripButton';

/** Dagens resa (vald i Sök resa): ersätter pendlingsförslagen. Avklarade sträckor enligt positionen, "Släpp resan" återställer. */
export function FocusTripCard({ focus, trains, pos, className = '' }: { focus: FocusTrip; trains: Train[]; pos?: Progress; className?: string }) {
  return (
    <section aria-label={`Dagens resa till ${focus.to}`} className={`flex flex-col gap-2 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="min-w-0 truncate text-[1.125rem] font-bold">Dagens resa · {focus.home ? 'hem' : focus.to}</h2>
        <ClearFocusButton />
      </div>
      <TransitTripCard trip={{ dep: focus.dep, arr: focus.arr, legs: focus.legs, startAt: null, endAt: null }} trains={trains} first home={focus.home} pos={pos} />
    </section>
  );
}
