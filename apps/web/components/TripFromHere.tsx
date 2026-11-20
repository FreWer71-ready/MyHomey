'use client';
import { useState } from 'react';
import { BASE_PATH } from '@/lib/paths';
import { hhmm } from '@/lib/prices';
import type { Train } from '@/lib/commute';
import type { TransitTrip } from '@/lib/transit';
import { TransitTripCard } from './TransitTrip';

type To = 'home' | 'work' | 'place';
type Mode = 'transit' | 'car';
type Result = { to: To; place?: string; mode: Mode; start: 'phone' | 'life360'; here?: boolean; trips?: TransitTrip[]; trains?: Train[]; eta?: { minutes: number; trafficMin: number; km: number; arrive: number } };

/** Mobilens plats (första prio). Tom sträng om den nekas, saknas eller dröjer: servern tar då Life360. */
const phonePos = () => new Promise<string>((done) => {
  if (!navigator.geolocation) return done('');
  navigator.geolocation.getCurrentPosition(
    (p) => done(`&lat=${p.coords.latitude.toFixed(5)}&lon=${p.coords.longitude.toFixed(5)}&acc=${Math.round(p.coords.accuracy)}`),
    () => done(''), { timeout: 4000, maximumAge: 60_000 },
  );
});
const SRC = { phone: 'telefonens plats', life360: 'Life360-positionen' } as const;

/**
 * "Resa från din plats": välj mål (hem/jobb) och ressätt (kollektivt/bil). Platsen hämtas först vid tryck:
 * mobilens plats, annars Life360. Förvalt mål följer tid på dygnet (jobbet före kl 12, annars hem).
 */
export function TripFromHere({ defaultTo, workLabel, transit, car }: { defaultTo: To; workLabel: string; transit: boolean; car: boolean }) {
  const [to, setTo] = useState<To>(defaultTo);
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<Mode>(transit ? 'transit' : 'car');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (!transit && !car) return null;

  const go = async () => {
    setBusy(true); setErr(null); setRes(null);
    try {
      if (to === 'place' && q.trim().length < 2) { setErr('Skriv en adress eller plats'); setBusy(false); return; }
      const r = await fetch(`${BASE_PATH}/api/trip?to=${to}&mode=${mode}${to === 'place' ? `&q=${encodeURIComponent(q.trim())}` : ''}${await phonePos()}`);
      const d = await r.json().catch(() => null);
      if (r.ok && d) setRes(d); else setErr(d?.error ?? 'Resan kunde inte räknas fram');
    } catch { setErr('Resan kunde inte räknas fram'); }
    setBusy(false);
  };
  const pick = <T extends string>(v: T, cur: T, set: (v: T) => void, label: string) => (
    <button type="button" aria-pressed={v === cur} onClick={() => { set(v); setRes(null); setErr(null); }} className={`pill grow justify-center ${v === cur ? 'on' : ''}`}>{label}</button>
  );
  const dest = (r: Result) => (r.to === 'home' ? 'hem' : r.to === 'place' ? r.place ?? 'platsen' : workLabel.toLowerCase());
  return (
    <section aria-label="Resa från din plats" className="flex flex-col gap-3 rounded-[1.5rem] glass p-3">
      <h2 className="text-xl font-extrabold">Resa från din plats</h2>
      {/* Snabbval Hem och jobbet; "Annan plats" öppnar ett fält för valfri adress eller plats. */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Mål">{pick<To>('home', to, setTo, 'Hem')}{pick<To>('work', to, setTo, workLabel)}{pick<To>('place', to, setTo, 'Annan plats')}</div>
      {to === 'place' && (
        <form onSubmit={(e) => { e.preventDefault(); go(); }} className="flex">
          <label htmlFor="resa-plats" className="sr-only">Adress eller plats</label>
          <input id="resa-plats" type="text" inputMode="search" enterKeyHint="go" autoComplete="street-address" value={q} maxLength={120}
            onChange={(e) => { setQ(e.target.value); setRes(null); setErr(null); }} placeholder="Adress eller plats, t.ex. Kungsgatan 3 Eskilstuna"
            className="min-h-12 w-full min-w-0 rounded-2xl border border-line bg-glass-2 px-4 text-[1rem] text-fg placeholder:text-dim" />
        </form>
      )}
      {transit && car && <div className="flex gap-2" role="group" aria-label="Ressätt">{pick<Mode>('transit', mode, setMode, 'Kollektivt')}{pick<Mode>('car', mode, setMode, 'Bil')}</div>}
      <button type="button" onClick={go} disabled={busy} className={`pill justify-center bg-sun font-bold text-ink ${busy ? 'animate-pulse' : ''}`}>
        {busy ? 'Räknar …' : 'Visa resan'}
      </button>
      {err && <p className="text-[0.9375rem] text-danger">{err}</p>}
      {res?.here && <p className="rounded-2xl bg-glass-2 p-3 font-bold">Du är redan {res.to === 'home' ? 'hemma' : 'framme'}.</p>}
      {res?.place && !res.here && <p className="text-[0.9375rem] text-dim">Till {res.place}</p>}
      {res?.eta && (
        <div className="flex flex-col gap-0.5 rounded-2xl bg-glass-2 px-4 py-3">
          <span className="text-[1rem] text-dim">Bil · {dest(res)} · om du åker nu</span>
          <span className="flex items-baseline gap-2 leading-none">
            <span className="text-[1.125rem] font-semibold">{res.to === 'home' ? 'Hemma' : 'Framme'}</span>
            <span className="text-[2.5rem] font-extrabold tabular-nums">{hhmm(res.eta.arrive)}</span>
          </span>
          <span className="text-[1rem] text-dim">{res.eta.minutes} min · {Math.round(res.eta.km)} km{res.eta.trafficMin > 0 && <b> · +{res.eta.trafficMin} min trafik</b>}</span>
        </div>
      )}
      {res?.trips && <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{res.trips.map((t, i) => <TransitTripCard key={t.dep} trip={t} trains={res.trains ?? []} first={i === 0} home={res.to === 'home'} />)}</div>}
      {res && !res.here && <p className="text-[0.875rem] text-dim">Räknat från {SRC[res.start]}</p>}
    </section>
  );
}
