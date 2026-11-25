import type { Train } from '@/lib/commute';
import { hhmm } from '@/lib/prices';
import { OnTrainButton } from './OnTrainButton';

/** Avgångar ±20 min (gått och kommande), ett per tågnummer och avgång, i tidsordning. */
export function nearDepartures(lists: Train[][], now: number, window = 20 * 60_000): Train[] {
  const seen = new Set<string>();
  return lists.flat()
    .filter((t) => {
      const k = `${t.ident}|${t.dep}`;
      if (t.canceled || Math.abs((t.est ?? t.dep) - now) > window || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => (a.est ?? a.dep) - (b.est ?? b.dep));
}

/** Tågläget är gissat: alla avgångar ±20 min i aktuell riktning, bekräfta rätt tåg med ett tryck. */
export function NearDepartures({ trains, now, guessed, className = '' }: { trains: Train[]; now: number; guessed: string; className?: string }) {
  if (!trains.length) return null;
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-[0.9375rem] font-semibold text-dim">Vilket tåg? Avgångar ±20 min</span>
      <ul className="flex flex-col gap-1">
        {trains.map((t) => {
          const d = t.est ?? t.dep, gone = d <= now, mine = t.ident === guessed;
          return (
            <li key={`${t.ident}-${t.dep}`} className="flex min-h-11 items-center gap-3">
              <span className="w-[3.25rem] shrink-0 text-[1.0625rem] font-bold tabular-nums">{hhmm(d)}</span>
              <span className="flex min-w-0 grow flex-col leading-tight">
                <span className="truncate font-semibold">{mine ? 'Gissat · ' : ''}{t.dest}</span>
                <span className="truncate text-[0.875rem] text-dim">{t.product ?? 'Tåg'} {t.ident} · {gone ? 'har gått' : `om ${Math.max(1, Math.round((d - now) / 60_000))} min`}</span>
              </span>
              <OnTrainButton ident={t.ident} dep={t.dep} arr={t.arr} label={mine ? 'Stämmer' : 'Det här'} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
