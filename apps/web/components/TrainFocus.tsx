'use client';
import { useEffect, useState } from 'react';
import { FOCUS_MIN, TONE_COLOR, countdown, countdownTone, departsAt, focusTrain, trainStatus, trainTone, type Train } from '@/lib/commute';
import { MinutesTo } from '@/components/MinutesTo';
import { TrainProgress } from '@/components/TrainProgress';
import { hhmm } from '@/lib/prices';
import { dayOf } from '@/lib/calendar-view';
import { tint } from '@/lib/scale';

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
function Focus({ t, now, large }: { t: Train; now: number; large?: boolean }) {
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
            {[t.track && `spår ${t.track}`, t.dest, large && t.arr ? `framme ${hhmm(t.arr)}` : null, t.delay >= 3 ? `ord. ${hhmm(t.dep)}` : null].filter(Boolean).join(' · ')}
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
      <div className="h-1.5 overflow-hidden rounded-full bg-glass-2" role="presentation">
        <div className="h-full rounded-full transition-[width] duration-1000 ease-linear" style={{ width: `${andel * 100}%`, background: farg }} suppressHydrationWarning />
      </div>
    </div>
  );
}

/** Pendlingskortet på Hem: fokuståget stort och två följande på en rad, annars fyra avgångar i 2×2. */
export function HomeTrains({ trains, serverNow }: { trains: Train[]; serverNow: number }) {
  const now = useNow(serverNow, trains);
  const fokus = focusTrain(trains, now);
  const kommande = trains.filter((t) => t !== fokus && departsAt(t) >= now - 30_000);
  if (fokus) {
    const efter = kommande.filter((t) => departsAt(t) > departsAt(fokus)).slice(0, 2);
    return (
      <div className="flex flex-col gap-2">
        <Focus t={fokus} now={now} />
        {efter.length > 0 && (
          <ul className="grid grid-cols-1 gap-x-5 gap-y-1 lg:grid-cols-2">
            {efter.map((t) => (
              <li key={t.id} className="flex min-w-0 items-baseline gap-2 text-[1rem] leading-tight">
                <span className={`font-bold tabular-nums ${t.canceled ? 'line-through opacity-60' : ''}`}>{hhmm(t.canceled ? t.dep : departsAt(t))}</span>
                <span className="truncate text-dim">{t.canceled ? '' : <MinutesTo at={departsAt(t)} className="tabular-nums" />}{t.track ? ` · spår ${t.track}` : ''}</span>
                <span className="ml-auto shrink-0 text-[0.875rem] font-semibold" style={{ color: trainTone(t) === 'ok' ? MUTE : TONE_COLOR[trainTone(t)] }}>{trainStatus(t).text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  return (
    <ul className="grid grid-cols-1 gap-x-5 gap-y-2.5 lg:grid-cols-2">
      {kommande.slice(0, 4).map((t) => {
        const tone = trainTone(t);
        return (
          <li key={t.id} className="flex min-w-0 flex-col leading-tight">
            <span className="flex items-baseline gap-2">
              <span className={`text-[1.75rem] font-bold tabular-nums ${t.canceled ? 'line-through opacity-60' : ''}`}>{hhmm(t.canceled ? t.dep : departsAt(t))}</span>
              <span className="ml-auto shrink-0 text-[0.9375rem] font-semibold" style={{ color: tone === 'ok' ? MUTE : TONE_COLOR[tone] }}>{trainStatus(t).text}</span>
            </span>
            <span className="truncate text-[0.9375rem] text-dim">
              {!t.canceled && (dayOf(t.dep) !== dayOf(now) ? <span className="font-semibold text-fg">imorgon</span> : <MinutesTo at={departsAt(t)} className="font-semibold text-fg tabular-nums" />)}
              {t.canceled ? '' : ' · '}{t.track ? `spår ${t.track}` : t.dest}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Avgångslistan på Pendling-sidan: tåget inom 45 minuter som stort fokus, övriga som vanliga rader. */
export function PageTrainList({ trains, serverNow }: { trains: Train[]; serverNow: number }) {
  const now = useNow(serverNow, trains);
  const fokus = focusTrain(trains, now);
  return (
    <ol className="flex flex-col gap-1.5">
      {trains.map((t) => {
        if (t === fokus) return <li key={t.id}><Focus t={t} now={now} large /></li>;
        const s = trainStatus(t);
        return (
          <li key={t.id} className="flex items-center gap-3 rounded-2xl px-3 py-2" style={{ background: tint(TONE_COLOR[trainTone(t)], 0.4) }}>
            <span className="flex w-[4rem] shrink-0 flex-col leading-tight">
              <span className={`text-xl font-extrabold tabular-nums ${t.canceled || t.delay >= 3 ? 'line-through decoration-2 opacity-70' : ''}`}>{hhmm(t.dep)}</span>
              {dayOf(t.dep) !== dayOf(now) && <span className="text-[0.875rem] font-semibold text-dim">imorgon</span>}
              {!t.canceled && t.delay >= 3 && t.est && <span className="text-lg font-extrabold tabular-nums">{hhmm(t.est)}</span>}
            </span>
            <span className="flex min-w-0 grow flex-col leading-tight">
              <span className="truncate font-extrabold">
                {t.dest}{t.arr && !t.canceled ? <span className="font-bold opacity-85"> · framme {hhmm(t.arr)}</span> : null}
              </span>
              <span className="truncate text-[0.875rem] font-bold opacity-85">
                {[t.product, `tåg ${t.ident}`, t.track && `spår ${t.track}`, ...t.notes].filter(Boolean).join(' · ')}
              </span>
            </span>
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[0.875rem] font-extrabold ${s.cls}`}>{s.text}</span>
          </li>
        );
      })}
    </ol>
  );
}
