'use client';
import { useState } from 'react';
import { BASE_PATH } from '@/lib/paths';
import { hhmm } from '@/lib/prices';
import type { Train } from '@/lib/commute';
import type { TransitTrip } from '@/lib/transit';
import { TransitTripCard, tripDelay } from './TransitTrip';
import { RoadImpact } from './RoadImpact';
import type { Tone } from '@/lib/commute';

type To = 'home' | 'work' | 'place';
type From = 'here' | To;
type Mode = 'transit' | 'car';
type Hinder = { type: string; road: string; place: string | null; tone: Tone; count: number };
type Result = { from: From; to: To; fromName?: string; place?: string; fromAddr?: string | null; toAddr?: string | null; hinder?: Hinder[]; mode: Mode; start: 'phone' | 'life360' | To; here?: boolean; trips?: TransitTrip[]; trains?: Train[]; eta?: { minutes: number; trafficMin: number; km: number; arrive: number } };

/** Mobilens plats (första prio). Tom sträng om den nekas, saknas eller dröjer: servern tar då Life360. */
const phonePos = () => new Promise<string>((done) => {
  if (!navigator.geolocation) return done('');
  navigator.geolocation.getCurrentPosition(
    (p) => done(`&lat=${p.coords.latitude.toFixed(5)}&lon=${p.coords.longitude.toFixed(5)}&acc=${Math.round(p.coords.accuracy)}`),
    () => done(''), { timeout: 4000, maximumAge: 60_000 },
  );
});
const SRC = { phone: 'telefonens plats', life360: 'Life360-positionen' } as const;

/** Ändpunkt: snabbval (Min plats, Hem, jobbet) eller valfri plats (fritext). */
type End = { kind: From; q: string };

/**
 * Reseplanering i SL:s stil: en kompakt ruta med Från och Till (fritext) och ⇅ på avdelaren. Snabbvalen (Min plats,
 * Hem, jobbet) visas bara när ett fält är aktivt. Ressätt och Sök på en rad under. Min plats hämtas först vid Sök:
 * mobilens plats, annars Life360.
 */
export function TripFromHere({ defaultTo, workLabel, transit, car }: { defaultTo: 'home' | 'work'; workLabel: string; transit: boolean; car: boolean }) {
  const [from, setFrom] = useState<End>({ kind: 'here', q: '' });
  const [to, setTo] = useState<End>({ kind: defaultTo, q: '' });
  const [active, setActive] = useState<'from' | 'to' | null>(null);
  const [mode, setMode] = useState<Mode>(transit ? 'transit' : 'car');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (!transit && !car) return null;
  const reset = () => { setRes(null); setErr(null); };
  const label = (e: End) => (e.kind === 'here' ? 'Min plats' : e.kind === 'home' ? 'Hem' : e.kind === 'work' ? workLabel : e.q);

  const go = async () => {
    setActive(null);
    if ((from.kind === 'place' && from.q.trim().length < 2) || (to.kind === 'place' && to.q.trim().length < 2)) { setErr('Skriv en adress eller plats'); return; }
    if (to.kind === 'here') { setErr('Min plats kan bara vara start'); return; }
    if (from.kind === to.kind && from.kind !== 'place') { setErr('Välj olika från och till'); return; }
    setBusy(true); reset();
    try {
      const enc = (v: string) => encodeURIComponent(v.trim());
      const r = await fetch(`${BASE_PATH}/api/trip?from=${from.kind}&to=${to.kind}&mode=${mode}${from.kind === 'place' ? `&fq=${enc(from.q)}` : ''}${to.kind === 'place' ? `&q=${enc(to.q)}` : ''}${from.kind === 'here' ? await phonePos() : ''}`);
      const d = await r.json().catch(() => null);
      if (r.ok && d) setRes(d); else setErr(d?.error ?? 'Resan kunde inte räknas fram');
    } catch { setErr('Resan kunde inte räknas fram'); }
    setBusy(false);
  };
  // Byt håll: Min plats kan bara vara start, så då blir målet hem.
  const swap = () => { reset(); setFrom(to); setTo(from.kind === 'here' ? { kind: 'home', q: '' } : from); };
  const set = (which: 'from' | 'to', e: End) => { reset(); (which === 'from' ? setFrom : setTo)(e); };
  const quick: { kind: From; text: string }[] = [
    ...(active === 'from' ? [{ kind: 'here' as const, text: 'Min plats' }] : []),
    { kind: 'home', text: 'Hem' }, { kind: 'work', text: workLabel },
  ];
  const field = (which: 'from' | 'to', e: End) => (
    <label className="flex min-h-14 items-center gap-3 px-4">
      <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${which === 'from' ? 'border-2 border-fg' : 'bg-sun'}`} />
      <span className="w-9 shrink-0 text-[0.9375rem] font-semibold text-dim">{which === 'from' ? 'Från' : 'Till'}</span>
      <input type="text" inputMode="search" enterKeyHint="search" autoComplete="street-address" maxLength={120}
        value={label(e)} placeholder="Adress eller plats" aria-label={which === 'from' ? 'Från' : 'Till'}
        onFocus={(ev) => { setActive(which); if (e.kind !== 'place') ev.currentTarget.select(); }}
        onBlur={() => setTimeout(() => setActive((x) => (x === which ? null : x)), 150)}
        onChange={(ev) => set(which, { kind: 'place', q: ev.target.value })}
        onKeyDown={(ev) => { if (ev.key === 'Enter') go(); }}
        className={`min-w-0 grow bg-transparent py-3 text-[1.0625rem] outline-none placeholder:text-dim ${e.kind === 'place' ? 'font-normal' : 'font-semibold'}`} />
    </label>
  );
  return (
    <section aria-label="Sök resa" className="flex flex-col gap-2.5 rounded-[1.5rem] glass p-3">
      <h2 className="px-1 text-[1.125rem] font-bold">Sök resa</h2>
      {/* Från/Till i en ruta, ⇅ på avdelaren. */}
      <div className="relative rounded-[1.125rem] bg-white/[0.07]">
        {field('from', from)}
        <div className="mr-16 ml-4 h-px bg-line" />
        {field('to', to)}
        <button type="button" onClick={swap} aria-label="Byt från och till"
          className="absolute top-1/2 right-2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-card text-[1.125rem]">⇅</button>
      </div>
      {/* Snabbval för fältet du står i. */}
      {active && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Snabbval ${active === 'from' ? 'från' : 'till'}`}>
          {quick.map((o) => (
            <button key={o.kind} type="button" onMouseDown={(ev) => ev.preventDefault()}
              onClick={() => { set(active, { kind: o.kind, q: '' }); setActive(null); }}
              className={`pill min-h-11 px-4 text-[0.9375rem] ${(active === 'from' ? from : to).kind === o.kind ? 'on' : ''}`}>{o.text}</button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        {transit && car && (
          <div className="flex rounded-full bg-white/[0.07] p-1" role="group" aria-label="Ressätt">
            {([['transit', 'Kollektivt'], ['car', 'Bil']] as const).map(([v, t]) => (
              <button key={v} type="button" aria-pressed={mode === v} onClick={() => { setMode(v); reset(); }}
                className={`min-h-10 rounded-full px-3.5 text-[0.9375rem] font-semibold ${mode === v ? 'bg-[#E6EDF3] text-[#0B0F14]' : 'text-dim'}`}>{t}</button>
            ))}
          </div>
        )}
        <button type="button" onClick={go} disabled={busy} className={`pill min-h-11 grow justify-center !bg-sun font-bold !text-ink ${busy ? 'animate-pulse' : ''}`}>
          {busy ? 'Söker …' : 'Sök'}
        </button>
      </div>
      {err && <p role="alert" className="px-1 text-[0.9375rem] text-danger">{err}</p>}
      {res?.here && <p className="rounded-2xl bg-glass-2 p-3 font-bold">Du är redan {res.to === 'home' ? 'hemma' : 'framme'}.</p>}
      {res && !res.here && <TripResult res={res} name={(k, place) => (k === 'home' ? 'hem' : k === 'work' ? workLabel.toLowerCase() : k === 'here' ? 'din plats' : place ?? 'platsen')} />}
      {res?.trips && <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{res.trips.map((t, i) => <TransitTripCard key={t.dep} trip={t} trains={res.trains ?? []} first={i === 0} home={res.to === 'home'} />)}</div>}
    </section>
  );
}

const cap = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);

/** Svaret: från/till med adress, ankomst stort, och läget – förseningar, trafik och hinder längs vägen. */
function TripResult({ res, name }: { res: Result; name: (k: From, place?: string) => string }) {
  const fromName = cap(name(res.from, res.fromName)), toName = cap(name(res.to, res.place));
  const late = res.trips?.[0] ? tripDelay(res.trips[0], res.trains ?? []) : null;
  const ok = (t: string) => <p className="flex items-center gap-2 font-semibold text-ok"><span aria-hidden="true">✓</span>{t}</p>;
  const warn = (t: string, bad = false) => <p className={`flex items-center gap-2 font-semibold ${bad ? 'text-danger' : 'text-warn'}`}><span aria-hidden="true">{bad ? '▲' : '◆'}</span>{t}</p>;
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-glass-2 p-4">
      {/* Från → till med adresser (punkter på en tidslinje). */}
      <ol className="flex flex-col gap-2" aria-label="Sträcka">
        {[[fromName, res.from === 'here' && res.start in SRC ? `${res.fromAddr ?? 'Okänd adress'} · ${SRC[res.start as keyof typeof SRC]}` : res.fromAddr], [toName, res.toAddr]].map(([n, addr], i) => (
          <li key={i} className="flex items-start gap-3">
            <span aria-hidden="true" className={`mt-1.5 size-3 shrink-0 rounded-full ${i ? 'bg-sun' : 'border-2 border-fg'}`} />
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="text-[0.875rem] font-bold text-dim">{i ? 'Till' : 'Från'}</span>
              <span className="text-[1.0625rem] font-bold">{n}</span>
              {addr && addr !== n && <span className="text-[0.9375rem] text-dim">{addr}</span>}
            </span>
          </li>
        ))}
      </ol>

      {res.eta && (
        <>
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-t border-line pt-3">
            <span className="flex flex-col leading-none">
              <span className="text-[1rem] font-semibold text-dim">{res.to === 'home' ? 'Hemma' : 'Framme'} med bil om du åker nu</span>
              <span className="text-[3rem] font-extrabold tabular-nums">{hhmm(res.eta.arrive)}</span>
            </span>
            <span className="text-[1rem] font-semibold">{res.eta.minutes} min · {Math.round(res.eta.km)} km</span>
          </div>
          {res.eta.trafficMin > 0 ? warn(`+${res.eta.trafficMin} min på grund av trafik`) : ok('Ingen trafikförsening')}
          {res.hinder && res.hinder.length > 0 ? (
            <ul className="flex flex-col gap-1.5" aria-label="Hinder längs vägen">
              {res.hinder.map((h, i) => (
                <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="rounded-md bg-black/25 px-1.5 text-[0.875rem] font-extrabold">{h.road}</span>
                  <span className="font-semibold">{h.type}{h.count > 1 ? ` ×${h.count}` : ''}</span>
                  <RoadImpact tone={h.tone} className="text-[0.9375rem]" />
                  {h.place && <span className="basis-full text-[0.9375rem] text-dim">{h.place}</span>}
                </li>
              ))}
            </ul>
          ) : ok('Inga hinder längs vägen')}
        </>
      )}

      {res.trips && late && (
        late.canceled ? warn('Inställd avgång på resan – se alternativ nedan', true)
          : late.delay >= 3 ? warn(`Försening ${late.delay} min på resan`, late.delay >= 20)
          : ok('Inga förseningar just nu')
      )}
    </div>
  );
}
