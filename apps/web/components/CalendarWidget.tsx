'use client';
import { useEffect, useState } from 'react';
import { BASE_PATH } from '@/lib/paths';
import { dayLabel, isOngoing, TZ, type Calendar, type CalEvent } from '@/lib/calendar-view';
import { Icon } from './Icon';

const hm = (ms: number) => new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(ms);

/**
 * Kalenderwidget (Ulrikas Google-kalender via /api/calendar). Idag och Imorgon visas alltid,
 * övriga dagar bara om något är inplanerat. Pågående händelse markeras. Uppdateras var 10:e minut.
 */
export function CalendarWidget() {
  const [cal, setCal] = useState<Calendar | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`${BASE_PATH}/api/calendar`, { cache: 'no-store' });
        const body = await res.json().catch(() => null);
        if (!alive) return;
        if (!res.ok || !body?.days) setError(body?.error ?? 'Kalendern kunde inte hämtas just nu.');
        else { setCal(body); setError(null); }
      } catch {
        if (alive) setError('Kalendern kunde inte hämtas just nu.');
      }
    };
    load();
    const poll = setInterval(load, 10 * 60_000);
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => { alive = false; clearInterval(poll); clearInterval(tick); };
  }, []);

  // Heldagshändelser visas inte, bara en markering vid dagen att det finns sådana.
  const days = (cal?.days ?? []).filter((d, i) => i < 2 || d.timed.some((e) => e.end! > now));

  return (
    <section aria-label="Kalender" className="glass relative flex h-full max-h-[26rem] w-full min-w-0 flex-col gap-2 overflow-hidden lg:max-h-none rounded-[22px] px-3 py-2.5" style={{ background: 'linear-gradient(rgb(139 92 246 / 0.32), rgb(139 92 246 / 0.32)), rgb(14 18 32 / 0.88)' }}>
      <h2 className="flex items-center gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-glass-hi"><Icon name="calendar" size={16} /></span>
        <span className="text-[15px] font-bold">Kalender</span>
      </h2>
      {error ? (
        <p role="status" className="rounded-xl bg-black/20 px-3 py-2 text-[15px] font-bold">
          {error} <span className="opacity-80">Vi försöker igen om en stund.</span>
        </p>
      ) : !cal ? (
        <p className="animate-pulse px-1 text-[15px] font-bold opacity-80">Hämtar kalendern …</p>
      ) : (
        <div className="scroll-x -mr-1.5 flex min-h-0 flex-col gap-1.5 overflow-y-auto pr-1.5">
          {days.map((d) => {
            const timed = d.timed.filter((e) => e.end! > now || d.date !== cal.days[0].date);
            const empty = timed.length === 0;
            return (
              <section key={d.date} className="flex flex-col gap-0.5">
                <h3 className="flex items-center gap-2 text-[13px] font-extrabold tracking-wide uppercase">
                  <span className="opacity-80">{dayLabel(d.date, now)}</span>
                  {d.allDay.length > 0 && (
                    <span className="rounded-full bg-black/25 px-1.5 text-[11px] font-bold tracking-normal normal-case opacity-90" title="Heldagshändelser">
                      + {d.allDay.length} heldag
                    </span>
                  )}
                </h3>
                {empty && <p className="text-[14px] font-bold opacity-70">Inget inplanerat{d.allDay.length ? ' med tid' : ''}</p>}
                {timed.map((e) => <Row key={e.id} e={e} now={now} />)}
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Row({ e, now }: { e: CalEvent; now: number }) {
  const live = isOngoing(e, now);
  return (
    <p className={`flex min-w-0 items-baseline gap-2 rounded-lg px-2 py-0.5 ${live ? 'bg-sun text-ink' : 'bg-black/15'}`}>
      <span className="shrink-0 text-[14px] font-extrabold tabular-nums">{hm(e.start!)}</span>
      <span className="min-w-0 grow truncate text-[15px] font-bold">
        {e.title}{e.location && <span className="font-semibold opacity-75"> · {e.location}</span>}
      </span>
      {live
        ? <span className="shrink-0 text-[12px] font-extrabold uppercase">Pågår · till {hm(e.end!)}</span>
        : <span className="shrink-0 text-[12px] font-bold opacity-70">–{hm(e.end!)}</span>}
    </p>
  );
}
