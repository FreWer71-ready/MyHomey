import { TONE_COLOR, type Train } from '@/lib/commute';
import { hhmm } from '@/lib/prices';
import type { TransitLeg } from '@/lib/transit';
import { OnTrainButton } from './OnTrainButton';
import { TrainProgress, TrainRoute } from './TrainProgress';
import { TransitLegs } from './TransitTrip';

const dur = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`);

/**
 * Tågläget på Pendling i en enda ruta (förut två som sa samma sak: "Pågående resa" och "Du är på tåget"):
 * måltiden stort med återstående tid och tågets status, var tåget är, hela resplanen och knapparna.
 * Gissat tåg (`guessed`) får rubriken "troligen" och knappen "Stämmer ✓"; bekräftat tåg "Inte på tåget".
 */
export function OngoingTrip({ run, legs, toWork, goalTime, now, arrived, confirmed, guessed, trains }: {
  run: Train; legs: TransitLeg[]; toWork: boolean; goalTime: number | null; now: number; arrived: boolean;
  confirmed: boolean; guessed: boolean; trains: Train[];
}) {
  const left = goalTime != null ? Math.max(0, Math.round((goalTime - now) / 60_000)) : null;
  const status = run.canceled ? { text: 'Inställt', color: TONE_COLOR.bad } : run.delay >= 1 ? { text: `Tåget +${run.delay} min`, color: run.delay >= 3 ? TONE_COLOR.warn : undefined } : { text: 'Tåget i tid', color: undefined };
  return (
    <section aria-label="Tåget du är på" className="flex flex-col gap-3 rounded-[1.5rem] glass p-4 ring-2 ring-sun/60">
      <h2 className="text-xl font-extrabold">{guessed ? 'Du är troligen på tåget' : toWork ? 'På väg till jobbet' : 'På väg hem'}</h2>
      {goalTime != null && (
        <div className="flex items-end justify-between gap-3">
          <span className="flex flex-col">
            <span className="text-[1rem] font-semibold text-dim">{toWork ? 'Framme på jobbet' : 'Hemma'}</span>
            <span className="text-[3rem] leading-none font-bold tracking-tight tabular-nums">{hhmm(goalTime)}</span>
          </span>
          <span className="flex flex-col items-end text-right text-[1rem] font-semibold">
            <span>om {dur(left ?? 0)}</span>
            <span className={status.color ? '' : 'text-dim'} style={status.color ? { color: status.color } : undefined}>{status.text}</span>
          </span>
        </div>
      )}
      {guessed && <p className="text-[0.9375rem] text-dim">Enligt senaste position vid stationen. Stämmer det?</p>}
      {!arrived && <TrainProgress ident={run.ident} />}
      {legs.length > 0 && <TransitLegs trip={{ dep: legs[0].dep, arr: legs.at(-1)!.arr, legs, startAt: null, endAt: null }} now={now} trains={trains} />}
      <div className="flex flex-wrap gap-2">
        <TrainRoute ident={run.ident} />
        <OnTrainButton ident={run.ident} dep={run.dep} arr={run.arr} confirmed={confirmed} label={confirmed ? undefined : 'Stämmer ✓'} />
      </div>
    </section>
  );
}
