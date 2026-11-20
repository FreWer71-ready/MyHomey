'use client';
import { useState } from 'react';
import { BASE_PATH } from '@/lib/paths';
import { hhmm } from '@/lib/prices';
import type { Train } from '@/lib/commute';
import type { TransitTrip } from '@/lib/transit';
import { TransitTripCard } from './TransitTrip';

type To = 'home' | 'work' | 'place';
type From = 'here' | To;
type Mode = 'transit' | 'car';
type Result = { from: From; to: To; fromName?: string; place?: string; mode: Mode; start: 'phone' | 'life360' | To; here?: boolean; trips?: TransitTrip[]; trains?: Train[]; eta?: { minutes: number; trafficMin: number; km: number; arrive: number } };

/** Mobilens plats (första prio). Tom sträng om den nekas, saknas eller dröjer: servern tar då Life360. */
const phonePos = () => new Promise<string>((done) => {
  if (!navigator.geolocation) return done('');
  navigator.geolocation.getCurrentPosition(
    (p) => done(`&lat=${p.coords.latitude.toFixed(5)}&lon=${p.coords.longitude.toFixed(5)}&acc=${Math.round(p.coords.accuracy)}`),
    () => done(''), { timeout: 4000, maximumAge: 60_000 },
  );
});
const SRC = { phone: 'telefonens plats', life360: 'Life360-positionen' } as const;

/** Fält för valfri plats (adress eller platsnamn). */
function PlaceInput({ id, label, value, set, onGo }: { id: string; label: string; value: string; set: (v: string) => void; onGo: () => void }) {
  return (
    <form onSubmit={(e) => { e.preventDefault(); onGo(); }} className="flex">
      <label htmlFor={id} className="sr-only">{label}</label>
      <input id={id} type="text" inputMode="search" enterKeyHint="go" autoComplete="street-address" value={value} maxLength={120}
        onChange={(e) => set(e.target.value)} placeholder="Adress eller plats, t.ex. Kungsgatan 3 Eskilstuna"
        className="min-h-12 w-full min-w-0 rounded-2xl border border-line bg-glass-2 px-4 text-[1rem] text-fg placeholder:text-dim" />
    </form>
  );
}

/**
 * Reseplanering, klassisk från–till: snabbval Min plats (bara från), Hem och jobbet, eller valfri plats.
 * ⇅ byter håll. Min plats hämtas först vid tryck: mobilens plats, annars Life360. Förvalt mål följer tid på dygnet.
 */
export function TripFromHere({ defaultTo, workLabel, transit, car }: { defaultTo: 'home' | 'work'; workLabel: string; transit: boolean; car: boolean }) {
  const [from, setFrom] = useState<From>('here');
  const [to, setTo] = useState<To>(defaultTo);
  const [fq, setFq] = useState('');
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<Mode>(transit ? 'transit' : 'car');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (!transit && !car) return null;
  const reset = () => { setRes(null); setErr(null); };

  const go = async () => {
    if ((from === 'place' && fq.trim().length < 2) || (to === 'place' && q.trim().length < 2)) { setErr('Skriv en adress eller plats'); return; }
    if (from === to && from !== 'place') { setErr('Välj olika från och till'); return; }
    setBusy(true); reset();
    try {
      const enc = (v: string) => encodeURIComponent(v.trim());
      const r = await fetch(`${BASE_PATH}/api/trip?from=${from}&to=${to}&mode=${mode}${from === 'place' ? `&fq=${enc(fq)}` : ''}${to === 'place' ? `&q=${enc(q)}` : ''}${from === 'here' ? await phonePos() : ''}`);
      const d = await r.json().catch(() => null);
      if (r.ok && d) setRes(d); else setErr(d?.error ?? 'Resan kunde inte räknas fram');
    } catch { setErr('Resan kunde inte räknas fram'); }
    setBusy(false);
  };
  // Byt håll: Min plats kan bara vara start, så då blir målet hem.
  const swap = () => {
    reset();
    if (from === 'here') { setFrom(to); setFq(q); setTo('home'); setQ(''); return; }
    setFrom(to); setTo(from); setFq(q); setQ(fq);
  };
  const pick = <T extends string>(v: T, cur: T, set: (v: T) => void, label: string) => (
    <button type="button" aria-pressed={v === cur} onClick={() => { set(v); reset(); }} className={`pill min-h-11 grow justify-center ${v === cur ? 'on' : ''}`}>{label}</button>
  );
  const name = (k: From, place?: string) => (k === 'home' ? 'hem' : k === 'work' ? workLabel.toLowerCase() : k === 'here' ? 'din plats' : place ?? 'platsen');
  const dest = (r: Result) => name(r.to, r.place);
  return (
    <section aria-label="Reseplanering" className="flex flex-col gap-3 rounded-[1.5rem] glass p-3">
      <h2 className="text-xl font-extrabold">Reseplanering</h2>
      <div className="flex items-stretch gap-2">
        <div className="flex min-w-0 grow flex-col gap-3">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-[0.9375rem] font-bold text-dim">Från</legend>
            <div className="flex flex-wrap gap-2">{pick<From>('here', from, setFrom, 'Min plats')}{pick<From>('home', from, setFrom, 'Hem')}{pick<From>('work', from, setFrom, workLabel)}{pick<From>('place', from, setFrom, 'Annan')}</div>
            {from === 'place' && <PlaceInput id="resa-fran" label="Från adress eller plats" value={fq} set={(v) => { setFq(v); reset(); }} onGo={go} />}
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-[0.9375rem] font-bold text-dim">Till</legend>
            <div className="flex flex-wrap gap-2">{pick<To>('home', to, setTo, 'Hem')}{pick<To>('work', to, setTo, workLabel)}{pick<To>('place', to, setTo, 'Annan')}</div>
            {to === 'place' && <PlaceInput id="resa-till" label="Till adress eller plats" value={q} set={(v) => { setQ(v); reset(); }} onGo={go} />}
          </fieldset>
        </div>
        <button type="button" onClick={swap} aria-label="Byt från och till" className="pill w-11 shrink-0 justify-center self-center !px-0 text-[1.25rem]">⇅</button>
      </div>
      {transit && car && <div className="flex gap-2" role="group" aria-label="Ressätt">{pick<Mode>('transit', mode, setMode, 'Kollektivt')}{pick<Mode>('car', mode, setMode, 'Bil')}</div>}
      <button type="button" onClick={go} disabled={busy} className={`pill min-h-12 justify-center !bg-sun font-bold !text-ink ${busy ? 'animate-pulse' : ''}`}>
        {busy ? 'Räknar …' : 'Visa resan'}
      </button>
      {err && <p role="alert" className="text-[0.9375rem] text-danger">{err}</p>}
      {res?.here && <p className="rounded-2xl bg-glass-2 p-3 font-bold">Du är redan {res.to === 'home' ? 'hemma' : 'framme'}.</p>}
      {res && !res.here && <p className="text-[0.9375rem] text-dim">{name(res.from, res.fromName).replace(/^./, (c) => c.toUpperCase())} → {dest(res)}</p>}
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
      {res && !res.here && res.from === 'here' && (res.start === 'phone' || res.start === 'life360') && <p className="text-[0.875rem] text-dim">Räknat från {SRC[res.start]}</p>}
    </section>
  );
}
