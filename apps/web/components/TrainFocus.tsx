'use client';
import { useEffect, useState } from 'react';
import { FOCUS_MIN, TONE_COLOR, countdown, countdownTone, departsAt, focusTrain, trainStatus, trainTone, type Train } from '@/lib/commute';
import { MinutesTo } from '@/components/MinutesTo';
import { TrainProgress, TrainRoute } from '@/components/TrainProgress';
import { OnTrainButton, SkipButton } from './OnTrainButton';
import { TrainJourney } from '@/components/TrainJourney';
import { hhmm } from '@/lib/prices';
import { dayOf } from '@/lib/calendar-view';
import { tint } from '@/lib/scale';

/** "framme 16:56" när tåget slutar vid målet, annars var ankomsten gäller ("Eskilstuna 17:00" för ett Örebro-tåg). */
const arrLabel = (t: Train) => (!t.arrAt || t.arrAt === t.dest ? 'framme' : t.arrAt.replace(/ C$/, ''));

// Nästa tåg inom 45 minuter lyfts fram med stor avgångstid och nedräkning. Fokus och nedräkning
// räknas här i webbläsaren, eftersom sidan bara hämtas om med några minuters mellanrum.

const MUTE = '#8B98A5';

/** Klockan just nu: varje sekund när ett tåg är i fokus, annars var 30:e sekund. Startar på serverns tid. */
function useNow(serverNow: number, list: Train[]) {
  const [now, setNow] = useState(serverNow);
  const tat = focusTrain(list, now) != null;
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), tat ? 1000 : 30_000);
    return () => clearInterval(id);
  }, [tat]);
  return now;
}

/** Det framlyfta tåget: avgångstid till vänster, stor nedräkning till höger och en stapel som krymper mot avgång. */
function Focus({ t, now, large, journey, plan }: { t: Train; now: number; large?: boolean; journey?: 'out' | 'home'; plan?: React.ReactNode }) {
  const kvar = departsAt(t) - now;
  const farg = countdownTone(kvar) === 'ok' ? 'var(--color-fg)' : TONE_COLOR[countdownTone(kvar)];
  const andel = Math.max(0, Math.min(1, kvar / (FOCUS_MIN * 60_000)));
  const s = trainStatus(t);
  const ton = trainTone(t);
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl px-3 py-2" style={{ background: tint(TONE_COLOR[ton], 0.32) }} aria-live="polite">
      {/* Får tid och nedräkning inte plats bredvid varandra hamnar nedräkningen på egen rad, till höger. */}
      <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
        <span className="flex min-w-[9rem] flex-1 flex-col leading-tight">
          <span className={`${large ? 'text-[2.5rem]' : 'text-[2.125rem]'} font-extrabold leading-none tabular-nums`}>{hhmm(departsAt(t))}</span>
          <span className="truncate text-[0.9375rem] font-semibold text-dim">
            {[t.track && `spår ${t.track}`, t.dest, large && t.arr ? `${arrLabel(t)} ${hhmm(t.arr)}${t.homeAt ? ` · hemma ${hhmm(t.homeAt)}` : ''}` : null, t.delay >= 3 ? `ord. ${hhmm(t.dep)}` : null].filter(Boolean).join(' · ')}
            <span className="font-bold" style={{ color: ton === 'ok' ? MUTE : TONE_COLOR[ton] }}> · {s.text}</span>
          </span>
        </span>
        <span className="ml-auto flex shrink-0 flex-col items-end leading-none">
          <span className="text-[0.875rem] font-bold text-dim">Avgår om</span>
          <span className={`${large ? 'text-[3.25rem]' : 'text-[2.75rem]'} font-extrabold leading-none tabular-nums`} style={{ color: farg }} suppressHydrationWarning>
            {countdown(kvar)}
          </span>
        </span>
      </div>
      {/* Var tåget är nu (stationer och driftplatser), tryck för hela sträckan. */}
      <TrainProgress ident={t.ident} />
      {/* Hela sträckan (alla mellanliggande punkter) och resan dörr till dörr. */}
      {/* Strax före och vid avgång: bekräfta att man är på tåget (tågläget på alla skärmar). */}
      {(() => {
        const route = <><TrainRoute ident={t.ident} />{kvar <= 10 * 60_000 && <OnTrainButton ident={t.ident} dep={t.dep} arr={t.arr} />}<SkipButton ident={t.ident} dep={t.dep} time={hhmm(departsAt(t))} compact /></>;
        // Resplanen för just det här tåget (från servern) visas här, en gång; annars "Dörr till dörr" som hämtas vid tryck.
        if (plan) return <><div className="flex flex-wrap gap-2">{route}</div>{plan}</>;
        return journey ? <TrainJourney ident={t.ident} toWork={journey === 'out'} before={route} /> : <div className="flex flex-wrap gap-2">{route}</div>;
      })()}
      <div className="h-1.5 overflow-hidden rounded-full bg-glass-2" role="presentation">
        <div className="h-full rounded-full transition-[width] duration-1000 ease-linear" style={{ width: `${andel * 100}%`, background: farg }} suppressHydrationWarning />
      </div>
    </div>
  );
}

const PICK_KEY = 'pendling-fokus';
type Pick = { ident: string; dep: number };

/** Tåget man valt att ha i fokus (sparas i webbläsaren, gäller tills tåget gått eller man släpper det). */
function usePick(): [Pick | null, (p: Pick | null) => void] {
  const [pick, setPick] = useState<Pick | null>(null);
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(PICK_KEY) ?? 'null') as Pick | null;
      if (v && typeof v.ident === 'string' && typeof v.dep === 'number' && Date.now() - v.dep < 6 * 3600_000) setPick(v);
    } catch { /* inget sparat val */ }
  }, []);
  const set = (p: Pick | null) => {
    setPick(p);
    try { if (p) localStorage.setItem(PICK_KEY, JSON.stringify(p)); else localStorage.removeItem(PICK_KEY); } catch { /* sparas inte */ }
  };
  return [pick, set];
}

/** "Välj": gör tåget till det som visas, övriga döljs (kan tas fram igen). */
function PickButton({ t, onPick, className = '' }: { t: Train; onPick: (p: Pick) => void; className?: string }) {
  return (
    <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPick({ ident: t.ident, dep: t.dep }); }}
      aria-label={`Visa bara tåget ${hhmm(departsAt(t))}`} className={`btn-row btn-row-quiet shrink-0 ${className}`}>
      Välj
    </button>
  );
}

/**
 * Pendlingskortet på Hem: fokuståget stort och två följande på en rad, annars fyra avgångar i 2×2.
 * `plan` är resplanen (gå om …, benen med nästa sträcka markerad) för tåget `plan.ident`: den visas en gång, i fokuserutan för det
 * tåget (annars ovanför listan). Väljer man ett tåg ("Välj") visas bara det; övriga döljs bakom "Visa övriga tåg".
 */
export function HomeTrains({ trains, serverNow, journey, plan }: { trains: Train[]; serverNow: number; journey?: 'out' | 'home'; plan?: { ident: string; node: React.ReactNode } }) {
  const now = useNow(serverNow, trains);
  const [pick, setPick] = usePick();
  const [others, setOthers] = useState(false);
  const picked = pick ? trains.find((t) => t.ident === pick.ident && t.dep === pick.dep && departsAt(t) >= now - 30_000) ?? null : null;
  const fokus = picked ?? focusTrain(trains, now);
  const kommande = trains.filter((t) => t !== fokus && departsAt(t) >= now - 30_000);
  const planHere = plan && fokus && plan.ident === fokus.ident ? plan.node : null;
  // Planen för ett annat tåg än det som visas: ovanför listan, men inte när man valt ett tåg (då hör den till de dolda tågen).
  const planTop = plan && !planHere && !picked ? <div className="border-b border-line pb-3">{plan.node}</div> : null;
  const choose = (p: Pick | null) => { setPick(p); setOthers(false); };
  if (fokus) {
    const efter = picked ? kommande : kommande.filter((t) => departsAt(t) > departsAt(fokus)).slice(0, 2);
    return (
      <div className="flex flex-col gap-2">
        {planTop}
        <Focus t={fokus} now={now} journey={planHere ? undefined : journey} plan={planHere} />
        {picked && (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" aria-expanded={others} onClick={() => setOthers((o) => !o)} className="btn-row btn-row-light">
              {others ? 'Dölj övriga tåg' : `Visa övriga tåg (${kommande.length})`}
            </button>
            <button type="button" onClick={() => choose(null)} className="btn-row btn-row-quiet">Släpp valet</button>
          </div>
        )}
        {efter.length > 0 && (!picked || others) && (
          <ul className="grid grid-cols-1 gap-x-5 gap-y-1 lg:grid-cols-2">
            {efter.map((t) => (
              <li key={t.id} className="flex min-w-0 items-center gap-2">
                <TrainRoute ident={t.ident} className="flex min-w-0 grow items-baseline gap-2 text-[1rem] leading-tight">
                <span className={`font-bold tabular-nums ${t.canceled ? 'line-through opacity-60' : ''}`}>{hhmm(t.canceled ? t.dep : departsAt(t))}</span>
                <span className="truncate text-dim">{t.canceled ? '' : <MinutesTo at={departsAt(t)} className="tabular-nums" />}{t.track ? ` · spår ${t.track}` : ''}</span>
                <span className="ml-auto shrink-0 text-[0.875rem] font-semibold" style={{ color: trainTone(t) === 'ok' ? MUTE : TONE_COLOR[trainTone(t)] }}>{trainStatus(t).text}</span>
                </TrainRoute>
                {!t.canceled && <PickButton t={t} onPick={choose} />}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {planTop}
      <ul className="grid grid-cols-1 gap-x-5 gap-y-2.5 lg:grid-cols-2">
        {kommande.slice(0, 4).map((t) => {
          const tone = trainTone(t);
          return (
            <li key={t.id} className="flex min-w-0 items-center gap-2">
              <TrainRoute ident={t.ident} className="flex min-w-0 grow flex-col leading-tight">
              <span className="flex items-baseline gap-2">
                <span className={`text-[1.75rem] font-bold tabular-nums ${t.canceled ? 'line-through opacity-60' : ''}`}>{hhmm(t.canceled ? t.dep : departsAt(t))}</span>
                <span className="ml-auto shrink-0 text-[0.9375rem] font-semibold" style={{ color: tone === 'ok' ? MUTE : TONE_COLOR[tone] }}>{trainStatus(t).text}</span>
              </span>
              <span className="truncate text-[0.9375rem] text-dim">
                {!t.canceled && (dayOf(t.dep) !== dayOf(now) ? <span className="font-semibold text-fg">imorgon</span> : <MinutesTo at={departsAt(t)} className="font-semibold text-fg tabular-nums" />)}
                {t.canceled ? '' : ' · '}{t.track ? `spår ${t.track}` : t.dest}
              </span>
              </TrainRoute>
              {!t.canceled && <PickButton t={t} onPick={choose} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Avgångslistan på Pendling-sidan: tåget inom 45 minuter som stort fokus, övriga som vanliga rader. */
export function PageTrainList({ trains, serverNow, journey }: { trains: Train[]; serverNow: number; journey?: 'out' | 'home' }) {
  const now = useNow(serverNow, trains);
  const fokus = focusTrain(trains, now);
  return (
    <ol className="flex flex-col gap-1.5">
      {trains.map((t) => {
        if (t === fokus) return <li key={t.id}><Focus t={t} now={now} large journey={journey} /></li>;
        const s = trainStatus(t);
        return (
          <li key={t.id} className="flex flex-col gap-2 rounded-2xl px-3 py-2" style={{ background: tint(TONE_COLOR[trainTone(t)], 0.4) }}>
            {/* Tryck på raden: hela sträckan med alla mellanliggande punkter. */}
            <TrainRoute ident={t.ident} className="flex items-center gap-3">
            <span className="flex w-[4rem] shrink-0 flex-col leading-tight">
              <span className={`text-xl font-extrabold tabular-nums ${t.canceled || t.delay >= 3 ? 'line-through decoration-2 opacity-70' : ''}`}>{hhmm(t.dep)}</span>
              {dayOf(t.dep) !== dayOf(now) && <span className="text-[0.875rem] font-semibold text-dim">imorgon</span>}
              {!t.canceled && t.delay >= 3 && t.est && <span className="text-lg font-extrabold tabular-nums">{hhmm(t.est)}</span>}
            </span>
            <span className="flex min-w-0 grow flex-col leading-tight">
              <span className="truncate font-extrabold">
                {t.dest}{t.arr && !t.canceled ? <span className="font-bold opacity-85"> · {arrLabel(t)} {hhmm(t.arr)}{t.homeAt ? ` · hemma ${hhmm(t.homeAt)}` : ''}</span> : null}
              </span>
              <span className="truncate text-[0.875rem] font-bold opacity-85">
                {[t.product, `tåg ${t.ident}`, t.track && `spår ${t.track}`, ...t.notes].filter(Boolean).join(' · ')}
              </span>
            </span>
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[0.875rem] font-extrabold ${s.cls}`}>{s.text}</span>
            </TrainRoute>
            {journey && !t.canceled
              ? <TrainJourney ident={t.ident} toWork={journey === 'out'} before={<SkipButton ident={t.ident} dep={t.dep} time={hhmm(t.dep)} />} />
              : <div><SkipButton ident={t.ident} dep={t.dep} time={hhmm(t.dep)} /></div>}
          </li>
        );
      })}
    </ol>
  );
}

/** Tåget man sitter på (tågläget): slutstation och beräknad ankomst, var tåget är nu och hela sträckan. */
export function RiddenTrain({ t, guessed, confirmed }: { t: Train; guessed?: boolean; confirmed?: boolean }) {
  const ton = trainTone(t);
  const arr = t.arr != null ? t.arr + (t.delay ?? 0) * 60_000 : null;
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl px-3 py-2" style={{ background: tint(TONE_COLOR[ton], 0.32) }}>
      <span className="text-[1.25rem] font-extrabold">{t.product ?? 'Tåg'} {t.ident} → {t.dest}</span>
      <span className="text-[1rem] font-semibold">
        {arr ? <>Framme ca <span className="text-[1.5rem] font-extrabold tabular-nums">{hhmm(arr)}</span></> : null}
        <span style={{ color: ton === 'ok' ? MUTE : TONE_COLOR[ton] }}> · {trainStatus(t).text}</span>
        {confirmed ? <span className="text-dim"> · bekräftat</span> : guessed && <span className="text-dim"> · enligt senaste position vid stationen</span>}
      </span>
      <TrainProgress ident={t.ident} />
      <div className="flex flex-wrap gap-2"><TrainRoute ident={t.ident} /><OnTrainButton ident={t.ident} dep={t.dep} arr={t.arr} confirmed={confirmed} label={confirmed ? undefined : 'Stämmer ✓'} /></div>
    </div>
  );
}
