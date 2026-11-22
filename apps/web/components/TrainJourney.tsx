'use client';
import { useState } from 'react';
import { BASE_PATH } from '@/lib/paths';
import { hhmm } from '@/lib/prices';
import type { TransitLeg } from '@/lib/transit';
import { TransitLegs } from './TransitTrip';

type Journey = { legs: TransitLeg[]; leave: number; arrive: number; start?: 'phone' | 'life360' | 'home' };

/** Mobilens plats (första prio, frågas först vid tryck). Null om den nekas, saknas eller dröjer: servern tar då Life360. */
const phonePos = () => new Promise<string>((done) => {
  if (!navigator.geolocation) return done('');
  navigator.geolocation.getCurrentPosition(
    (p) => done(`?lat=${p.coords.latitude.toFixed(5)}&lon=${p.coords.longitude.toFixed(5)}&acc=${Math.round(p.coords.accuracy)}`),
    () => done(''), { timeout: 4000, maximumAge: 120_000 },
  );
});
const SRC = { phone: 'telefonens plats', life360: 'Life360-positionen' } as const;

/**
 * "Dörr till dörr ›" för ett tåg i pendlingen: hämtar resan (ResRobot) först vid tryck och visar den tills tåget gått.
 * Är man sen att gå visas hur lång tid det är kvar till avgång (cykel eller taxi i stället för promenad).
 */
export function TrainJourney({ ident, toWork, before }: { ident: string; toWork: boolean; before?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [j, setJ] = useState<Journey | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const toggle = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    setOpen((o) => !o);
    if (!j) phonePos().then((qs) => fetch(`${BASE_PATH}/api/journey/${ident}${qs}`)).then(async (r) => {
      const d = await r.json().catch(() => null);
      if (r.ok && d?.legs) setJ(d); else setErr(d?.error ?? 'Resan kunde inte räknas fram');
    }).catch(() => setErr('Resan kunde inte räknas fram'));
  };
  const now = Date.now();
  const train = j?.legs.find((l) => l.num === ident);
  const lateMin = j && now > j.leave ? Math.round((now - j.leave) / 60_000) : 0;
  const toTrain = train ? Math.max(0, Math.round((train.dep - now) / 60_000)) : 0;
  return (
    <div className="flex flex-col gap-2" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
      <div className="flex flex-wrap gap-2">
        {before}
        <button type="button" onClick={toggle} aria-expanded={open} className="btn-row btn-row-light w-fit">
          Dörr till dörr {open ? '▾' : '›'}
        </button>
      </div>
      {open && (!j ? (
        <p className={`text-[0.9375rem] ${err ? 'text-danger' : 'animate-pulse text-dim'}`}>{err ?? 'Räknar fram resan …'}</p>
      ) : (
        <div className="flex flex-col gap-1.5 rounded-xl bg-black/20 p-2.5">
          <p className="text-[1rem]">
            <span className="font-semibold">{lateMin > 0 ? 'Du är sen' : `Gå ${hhmm(j.leave)}`}</span>
            {' · '}{toWork ? 'framme' : 'hemma'} {hhmm(j.arrive)}
          </p>
          {lateMin > 0 && (
            <p className="text-[0.9375rem] font-semibold text-warn">
              Tåget går om {toTrain} min – ta cykel eller taxi till {train?.from ?? 'stationen'} i stället för att gå.
            </p>
          )}
          {j.start && j.start !== 'home' && <p className="text-[0.875rem] text-dim">Räknat från {SRC[j.start]}</p>}
          <TransitLegs trip={{ dep: j.leave, arr: j.arrive, legs: j.legs, startAt: null, endAt: null }} trains={[]} compact />
        </div>
      ))}
    </div>
  );
}
