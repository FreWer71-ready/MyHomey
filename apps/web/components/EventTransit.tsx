'use client';
import { useState } from 'react';
import { BASE_PATH } from '@/lib/paths';
import { phonePos } from '@/lib/phone-pos';
import { useUppdatera } from '@/lib/uppdatera';
import { hhmm } from '@/lib/prices';
import type { Train } from '@/lib/commute';
import type { TransitTrip } from '@/lib/transit';
import { DepartsFrom, TransitLegs } from './TransitTrip';
import { LeaveIn } from './LeaveIn';

type Answer = { trips?: TransitTrip[]; trains?: Train[]; here?: boolean };

/**
 * Kollektivt till nästa kalenderhändelse, dörr till dörr, planerat först vid tryck (ingen extra sökning vid sidladdning).
 * Räknar baklänges från `arriveBy` (start minus vald marginal): senaste resan som hinner fram och en tidigare, säkrare.
 * `fromHere`: personen är borta hemifrån, då räknas resan från mobilens plats (annars Life360); annars från hemmet.
 */
export function EventTransit({ place, start, arriveBy, fromHere }: { place: string; start: number; arriveBy: number; fromHere: boolean }) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<(Answer & { got: number }) | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const plan = async (fresh = false) => {
    setBusy(true); setErr(null);
    try {
      const t = Math.max(arriveBy, Date.now() + 60_000);
      const r = await fetch(`${BASE_PATH}/api/trip?from=${fromHere ? 'here' : 'home'}&to=place&q=${encodeURIComponent(place)}&mode=transit&when=arr&t=${t}${fromHere ? await phonePos(fresh) : ''}`);
      const d = await r.json().catch(() => null) as (Answer & { error?: string }) | null;
      if (r.ok && d) setRes({ ...d, got: Date.now() });
      else setErr(r.status === 502 ? 'Ingen kollektivresa hinner fram i tid.' : d?.error ?? 'Resan kunde inte räknas fram');
    } catch { setErr('Resan kunde inte räknas fram'); }
    setBusy(false);
  };

  // "Uppdatera": visas en plan räknas den om (ny plats om resan går från mobilens plats); den gamla visas tills den nya kommer.
  useUppdatera(() => { if (res && !busy) void plan(true); });

  // Senaste resan som hinner fram först (API:t svarar tidigast först).
  const trips = res?.trips ? [...res.trips].reverse() : [];
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      {!res && (
        <button type="button" onClick={() => void plan()} disabled={busy} className={`pill min-h-11 justify-center self-start px-4 text-[1rem] ${busy ? 'animate-pulse' : ''}`}>
          {busy ? 'Planerar …' : 'Åk kollektivt · dörr till dörr'}
        </button>
      )}
      {busy && res && <p className="animate-pulse text-[0.875rem] text-dim">Uppdaterar plats och resa …</p>}
      {err && <p role="alert" className="text-[1rem] font-semibold text-danger">{err}</p>}
      {res?.here && <p className="text-[1rem] text-dim">Du är redan på plats.</p>}
      {res && !res.here && trips.length === 0 && <p className="text-[1rem] text-dim">Ingen kollektivresa hinner fram i tid.</p>}
      {trips.map((t, i) => {
        const early = Math.round((start - t.arr) / 60_000);
        return (
          <div key={t.dep} className={`flex flex-col gap-1 ${i > 0 ? 'border-t border-line pt-2' : ''}`}>
            <p className="text-[1rem]">
              <span className="font-semibold">{i === 0 ? 'Senast' : 'Tidigare'}:</span>{' '}
              <LeaveIn dep={t.dep} serverNow={res!.got} variant="line" />
              {' · '}framme {hhmm(t.arr)} <span className="text-dim">({early > 0 ? `${early} min före` : 'precis i tid'})</span>
            </p>
            <DepartsFrom trip={t} />
            <TransitLegs trip={t} trains={res!.trains ?? []} compact />
          </div>
        );
      })}
      {res && <button type="button" onClick={() => { setRes(null); setErr(null); }} className="pill min-h-11 justify-center self-start px-4 text-[0.9375rem]">Stäng</button>}
    </div>
  );
}
