'use client';
import { useEffect, useState } from 'react';
import { BASE_PATH } from '@/lib/paths';
import { phonePos } from '@/lib/phone-pos';
import { hhmm } from '@/lib/prices';
import type { Train } from '@/lib/commute';
import type { TransitTrip } from '@/lib/transit';
import { TransitTripCard, tripDelay } from './TransitTrip';
import { RoadImpact } from './RoadImpact';
import { FocusTripButton } from './FocusTripButton';
import type { Tone } from '@/lib/commute';

type To = 'home' | 'work' | 'place';
type From = 'here' | To;
type Mode = 'transit' | 'car';
type Hinder = { type: string; road: string; place: string | null; tone: Tone; count: number };
type When = 'now' | 'dep' | 'arr';
type Result = { from: From; to: To; when?: When; at?: number; fromName?: string; place?: string; fromAddr?: string | null; toAddr?: string | null; hinder?: Hinder[]; mode: Mode; start: 'phone' | 'life360' | To; here?: boolean; trips?: TransitTrip[]; trains?: Train[]; eta?: { minutes: number; trafficMin: number; km: number; arrive: number; depart?: number; live?: boolean } };

const SRC = { phone: 'telefonens plats', life360: 'Life360-positionen' } as const;

/** Ändpunkt: snabbval (Min plats, Hem, jobbet) eller valfri plats (fritext, eller valt förslag med punkt). */
type End = { kind: From; q: string; ll?: string };
type Place = { name: string; lat: number; lon: number; kind: 'stop' | 'address' | 'place' };
const KIND_TEXT = { stop: 'Hållplats', address: 'Adress', place: 'Plats' } as const;

/**
 * Reseplanering i SL:s stil: en kompakt ruta med Från och Till (fritext) och ⇅ på avdelaren. Snabbvalen (Min plats,
 * Hem, jobbet) visas bara när ett fält är aktivt. Ressätt och Sök på en rad under. Min plats hämtas först vid Sök:
 * mobilens plats, annars Life360.
 */
export function TripFromHere({ defaultTo, workLabel, transit, car }: { defaultTo: 'home' | 'work'; workLabel: string; transit: boolean; car: boolean }) {
  const [from, setFrom] = useState<End>({ kind: 'here', q: '' });
  const [to, setTo] = useState<End>({ kind: defaultTo, q: '' });
  const [active, setActive] = useState<'from' | 'to' | null>(null);
  // Förslag medan man skriver (ResRobot: hållplatser, adresser, platser), 250 ms efter sista tangenttrycket.
  const [sugg, setSugg] = useState<Place[]>([]);
  const typed = active === 'from' ? from : active === 'to' ? to : null;
  const term = typed?.kind === 'place' && !typed.ll ? typed.q.trim() : '';
  useEffect(() => {
    if (term.length < 2) { setSugg([]); return; }
    let alive = true;
    const t = setTimeout(() => {
      fetch(`${BASE_PATH}/api/places?q=${encodeURIComponent(term)}`).then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (alive) setSugg(Array.isArray(d?.places) ? d.places : []); }).catch(() => {});
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [term]);
  const [mode, setMode] = useState<Mode>(transit ? 'transit' : 'car');
  // Tid: nu, avgång vid eller framme senast. Fältet tar lokal tid (datetime-local).
  const [when, setWhen] = useState<When>('now');
  const [time, setTime] = useState('');
  const localNow = (ms: number) => { const d = new Date(ms - new Date().getTimezoneOffset() * 60_000); return d.toISOString().slice(0, 16); };
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Minimerad visar bara rubriken; valet sparas på enheten.
  const [open, setOpen] = useState(true);
  useEffect(() => { try { if (localStorage.getItem('trip-closed') === '1') setOpen(false); } catch { /* privat läge */ } }, []);
  if (!transit && !car) return null;
  const toggle = () => setOpen((o) => { try { localStorage.setItem('trip-closed', o ? '1' : '0'); } catch { /* privat läge */ } return !o; });
  const reset = () => { setRes(null); setErr(null); };
  // Rensa: tillbaka till Min plats → förvalt mål, utan svar.
  const clear = () => { reset(); setFrom({ kind: 'here', q: '' }); setTo({ kind: defaultTo, q: '' }); setActive(null); setWhen('now'); };
  const dirty = !!res || !!err || from.kind !== 'here' || to.kind !== defaultTo || when !== 'now';
  const name = (k: From, place?: string) => (k === 'home' ? 'hem' : k === 'work' ? workLabel.toLowerCase() : k === 'here' ? 'din plats' : place ?? 'platsen');
  const label = (e: End) => (e.kind === 'here' ? 'Min plats' : e.kind === 'home' ? 'Hem' : e.kind === 'work' ? workLabel : e.q);

  const go = async () => {
    setActive(null);
    if ((from.kind === 'place' && from.q.trim().length < 2) || (to.kind === 'place' && to.q.trim().length < 2)) { setErr('Skriv en adress eller plats'); return; }
    if (to.kind === 'here') { setErr('Min plats kan bara vara start'); return; }
    if (from.kind === to.kind && from.kind !== 'place') { setErr('Välj olika från och till'); return; }
    const t = when === 'now' ? null : new Date(time).getTime();
    if (when !== 'now' && !Number.isFinite(t)) { setErr('Välj en tid'); return; }
    setBusy(true); reset();
    try {
      const enc = (v: string) => encodeURIComponent(v.trim());
      const r = await fetch(`${BASE_PATH}/api/trip?from=${from.kind}&to=${to.kind}&mode=${mode}${from.kind === 'place' ? `&fq=${enc(from.q)}${from.ll ? `&fqll=${from.ll}` : ''}` : ''}${to.kind === 'place' ? `&q=${enc(to.q)}${to.ll ? `&qll=${to.ll}` : ''}` : ''}${when !== 'now' ? `&when=${when}&t=${t}` : ''}${from.kind === 'here' ? await phonePos() : ''}`);
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
      <h2 className="flex items-center gap-2">
        <button type="button" onClick={toggle} aria-expanded={open} aria-controls="sok-resa"
          className="flex min-h-11 grow items-center gap-2 px-1 text-left text-[1.125rem] font-bold">
          Sök resa
          <span aria-hidden="true" className={`text-[1rem] text-dim transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
          {!open && <span className="truncate text-[0.9375rem] font-normal text-dim">{label(from) || 'Från'} → {label(to) || 'Till'}</span>}
        </button>
        {open && dirty && <button type="button" onClick={clear} className="btn-row !bg-white/[0.08]">Rensa</button>}
      </h2>
      <div id="sok-resa" hidden={!open} className="contents">
      {/* Från/Till i en ruta, ⇅ på avdelaren. */}
      <div className="relative rounded-[1.125rem] bg-white/[0.07]">
        {field('from', from)}
        <div className="mr-16 ml-4 h-px bg-line" />
        {field('to', to)}
        <button type="button" onClick={swap} aria-label="Byt från och till"
          className="absolute top-1/2 right-2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-card text-[1.125rem]">⇅</button>
      </div>
      {/* Förslag medan du skriver: välj ett så används just den hållplatsen eller adressen. */}
      {active && sugg.length > 0 && (
        <ul role="listbox" aria-label={`Förslag ${active === 'from' ? 'från' : 'till'}`} className="flex flex-col overflow-hidden rounded-[1.125rem] bg-white/[0.07]">
          {sugg.map((p) => (
            <li key={`${p.name}-${p.lat}-${p.lon}`} className="border-b border-line last:border-b-0">
              <button type="button" role="option" aria-selected={false} onMouseDown={(ev) => ev.preventDefault()}
                onClick={() => { set(active, { kind: 'place', q: p.name, ll: `${p.lat},${p.lon}` }); setSugg([]); setActive(null); }}
                className="flex min-h-12 w-full items-center gap-3 px-4 text-left">
                <span className="min-w-0 grow truncate text-[1rem]">{p.name}</span>
                <span className="shrink-0 text-[0.8125rem] text-dim">{KIND_TEXT[p.kind]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
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
      {/* När: nu, avgång vid eller framme senast (som SL:s "När vill du resa?"). */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-full bg-white/[0.07] p-1" role="group" aria-label="När">
          {([['now', 'Nu'], ['dep', 'Avgång'], ['arr', 'Ankomst']] as const).map(([v, txt]) => (
            <button key={v} type="button" aria-pressed={when === v}
              onClick={() => { setWhen(v); reset(); if (v !== 'now' && !time) setTime(localNow(Date.now() + 30 * 60_000)); }}
              className={`min-h-10 rounded-full px-3.5 text-[0.9375rem] font-semibold ${when === v ? 'sel' : 'text-dim'}`}>{txt}</button>
          ))}
        </div>
        {when !== 'now' && (
          <input type="datetime-local" value={time} min={localNow(Date.now() - 3600_000)} onChange={(e) => { setTime(e.target.value); reset(); }}
            aria-label={when === 'dep' ? 'Avgångstid' : 'Ankomsttid'}
            className="min-h-11 min-w-0 grow rounded-full border border-line bg-white/[0.07] px-4 text-[1rem] text-fg [color-scheme:dark]" />
        )}
      </div>
      <div className="flex items-center gap-2">
        {transit && car && (
          <div className="flex rounded-full bg-white/[0.07] p-1" role="group" aria-label="Ressätt">
            {([['transit', 'Kollektivt'], ['car', 'Bil']] as const).map(([v, t]) => (
              <button key={v} type="button" aria-pressed={mode === v} onClick={() => { setMode(v); reset(); }}
                className={`min-h-10 rounded-full px-3.5 text-[0.9375rem] font-semibold ${mode === v ? 'sel' : 'text-dim'}`}>{t}</button>
            ))}
          </div>
        )}
        <button type="button" onClick={go} disabled={busy} className={`pill min-h-11 grow justify-center !bg-sun font-bold !text-ink ${busy ? 'animate-pulse' : ''}`}>
          {busy ? 'Söker …' : 'Sök'}
        </button>
      </div>
      {err && <p role="alert" className="px-1 text-[0.9375rem] text-danger">{err}</p>}
      {res?.here && <p className="rounded-2xl bg-glass-2 p-3 font-bold">Du är redan {res.to === 'home' ? 'hemma' : 'framme'}.</p>}
      {res && !res.here && <TripResult res={res} name={name} />}
      {/* Varje resa kan väljas som dagens resa: den ersätter pendlingsförslagen på Hem och Pendling resten av dagen. */}
      {res?.trips && <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{res.trips.map((t, i) => (
        <TransitTripCard key={t.dep} trip={t} trains={res.trains ?? []} first={i === 0} home={res.to === 'home'}
          action={<FocusTripButton legs={t.legs} to={cap(name(res.to, res.place))} home={res.to === 'home'} />} />
      ))}</div>}
      </div>
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
              {res.when === 'arr' && res.eta.depart != null ? (
                <>
                  <span className="text-[1rem] font-semibold text-dim">Åk senast med bil för att vara {res.to === 'home' ? 'hemma' : 'framme'} {hhmm(res.at!)}</span>
                  <span className="text-[3rem] font-extrabold tabular-nums">{hhmm(res.eta.depart)}</span>
                </>
              ) : (
                <>
                  <span className="text-[1rem] font-semibold text-dim">{res.to === 'home' ? 'Hemma' : 'Framme'} med bil om du åker {res.when === 'dep' ? hhmm(res.at!) : 'nu'}</span>
                  <span className="text-[3rem] font-extrabold tabular-nums">{hhmm(res.eta.arrive)}</span>
                </>
              )}
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
