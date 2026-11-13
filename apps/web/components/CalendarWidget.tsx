'use client';
import { useEffect, useRef, useState } from 'react';
import { BASE_PATH } from '@/lib/paths';
import { CAL_COLORS, dayLabel, isOngoing, isOwnTeam, shortTitle, TZ, type Calendar, type CalEvent } from '@/lib/calendar-view';
import { Icon } from './Icon';

const hm = (ms: number) => new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(ms);

/**
 * Kalender (hushållets Google-kalendrar via /api/calendar). Idag och Imorgon visas alltid, övriga dagar bara
 * om något med tid är inplanerat. Heldag markeras bara vid dagen. Pågående och egna lagets matcher lyfts fram.
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

  const days = (cal?.days ?? []).filter((d, i) => i < 2 || d.timed.some((e) => e.end! > now));
  const week = useRef<HTMLDivElement>(null);

  return (
    <>
    {/* Tryck på kortet: de närmaste 7 dagarna i en egen ruta. */}
    <section
      aria-label="Kalender" role="button" tabIndex={0}
      onClick={() => cal && week.current?.showPopover()}
      onKeyDown={(e) => { if (cal && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); week.current?.showPopover(); } }}
      className="flex max-h-[30rem] min-h-0 w-full min-w-0 cursor-pointer flex-col gap-3 overflow-hidden rounded-[20px] bg-card p-5 lg:max-h-none lg:p-6"
    >
      <h2 className="flex items-center gap-2.5 text-[18px] font-semibold text-dim">
        <Icon name="calendar" size={22} />Kalender
        <span className="ml-auto text-[16px] font-normal">7 dagar ›</span>
      </h2>
      {error ? (
        <p role="status" className="text-[16px] text-dim">{error} Vi försöker igen om en stund.</p>
      ) : !cal ? (
        <p className="animate-pulse text-[16px] text-dim">Hämtar kalendern …</p>
      ) : (
        <div className="scroll-x -mr-2 flex min-h-0 flex-col gap-3 overflow-y-auto pr-2">
          {days.map((d) => {
            const timed = d.timed.filter((e) => e.end! > now || d.date !== cal.days[0].date);
            return (
              <section key={d.date} className="flex flex-col gap-1.5">
                <h3 className="flex items-center gap-2 text-[16px] font-semibold">
                  <span className="first-letter:uppercase">{dayLabel(d.date, now)}</span>
                  {d.allDay.length > 0 && <span className="text-[16px] font-normal text-dim">· {d.allDay.length} heldag</span>}
                </h3>
                {timed.length === 0 && <p className="text-[16px] text-dim">Inget inplanerat{d.allDay.length ? ' med tid' : ''}</p>}
                {timed.map((e) => <Row key={e.id} e={e} now={now} />)}
              </section>
            );
          })}
        </div>
      )}
    </section>
    {cal && (
      <div ref={week} id="kalender-vecka" popover="auto" className="m-auto max-h-[88dvh] w-[min(94vw,720px)] overflow-hidden rounded-[20px] bg-card p-0 text-fg shadow-2xl backdrop:bg-black/60">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="flex items-center gap-2.5 text-[20px] font-semibold"><Icon name="calendar" size={24} />Kommande 7 dagar</h2>
          <button type="button" popoverTarget="kalender-vecka" popoverTargetAction="hide" className="rounded-full bg-white/[0.08] px-4 py-2 text-[16px] font-semibold">Stäng</button>
        </div>
        <div className="max-h-[calc(88dvh-72px)] overflow-y-auto px-5 py-4">
          {cal.days.map((d) => (
            <section key={d.date} className="flex flex-col gap-1.5 border-b border-line py-3 last:border-b-0">
              <h3 className="text-[17px] font-semibold first-letter:uppercase">{dayLabel(d.date, now)}</h3>
              {d.allDay.map((e) => (
                <p key={e.id} className="flex items-center gap-3 px-3 text-[16px] text-dim">
                  {e.src !== undefined && <span className="size-2.5 shrink-0 rounded-full" style={{ background: CAL_COLORS[e.src % CAL_COLORS.length] }} aria-hidden="true" />}
                  <span className="w-[108px] shrink-0">Heldag</span>
                  <span className="truncate text-fg">{shortTitle(e.title)}</span>
                </p>
              ))}
              {d.timed.map((e) => <Row key={e.id} e={e} now={now} />)}
              {d.allDay.length + d.timed.length === 0 && <p className="px-3 text-[16px] text-dim">Inget inplanerat</p>}
            </section>
          ))}
        </div>
      </div>
    )}
    </>
  );
}

function Row({ e, now }: { e: CalEvent; now: number }) {
  const live = isOngoing(e, now);
  const own = isOwnTeam(e.title);
  return (
    <p className={`flex min-w-0 items-baseline gap-3 rounded-[12px] px-3 py-1.5 ${live ? 'bg-[#E6EDF3] text-[#0B0F14]' : own ? 'shadow-[inset_3px_0_0_#E6EDF3]' : ''}`}>
      {e.src !== undefined && <span className="size-2.5 shrink-0 self-center rounded-full" style={{ background: CAL_COLORS[e.src % CAL_COLORS.length] }} aria-hidden="true" />}
      <span className="shrink-0 text-[16px] font-semibold tabular-nums">{hm(e.start!)}–{hm(e.end!)}</span>
      <span className={`min-w-0 grow truncate text-[17px] ${own ? 'font-bold' : ''}`}>
        {shortTitle(e.title)}
        {e.location && <span className={live ? 'opacity-70' : 'text-dim'}> · {e.location.split(',')[0]}</span>}
      </span>
      {live && <span className="shrink-0 text-[14px] font-bold uppercase">Pågår</span>}
    </p>
  );
}
