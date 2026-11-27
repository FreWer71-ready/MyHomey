'use client';
import { Fragment, useEffect, useRef, useState } from 'react';
import { BASE_PATH } from '@/lib/paths';
import { CAL_COLORS, FREE_BG, FREE_CHIP, FREE_FG, dayInfo, dayOf, isOngoing, isOwnTeam, shortTitle, TZ, type Calendar, type CalEvent, type DayInfo } from '@/lib/calendar-view';
import { Icon } from './Icon';

const hm = (ms: number) => new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(ms);

/**
 * Kalender (hushållets Google-kalendrar via /api/calendar). Idag och Imorgon visas alltid, övriga dagar bara
 * om något med tid är inplanerat. Heldag markeras bara vid dagen. Pågående och egna lagets matcher lyfts fram.
 */
export function CalendarWidget({ src = '/api/calendar', title = 'Kalender', id = 'kalender-vecka', collapsible = true, compact = false }: { src?: string; title?: string; id?: string; collapsible?: boolean; compact?: boolean } = {}) {
  const [cal, setCal] = useState<Calendar | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`${BASE_PATH}${src}`, { cache: 'no-store' });
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
  }, [src]);

  // Bara dagar med något kvar: tidsatta som inte är slut, eller heldag.
  // Kortet: idag + 7 dagar, högst 4 händelser per dag. Rutan vid tryck: hela månaden (30 dagar).
  // Egen kalender: idag + 14 dagar, högst 8 händelser per dag. Speglad (compact): idag + 7 dagar, högst 4.
  const ahead = compact ? 7 : 14, perDay = compact ? 4 : 8;
  const days = (cal?.days ?? []).slice(0, ahead + 1).filter((d) => d.allDay.length > 0 || d.timed.some((e) => e.end! > now));
  const monthDays = (cal?.days ?? []).filter((d) => d.allDay.length + d.timed.length > 0);
  const week = useRef<HTMLDivElement>(null);

  // Infällt kort: bara rubriken och en sammanfattning. Valet sparas per kalender på enheten.
  // collapsible=false (kalenderfokus på Hem): alltid utfälld, ingen knapp för att fälla in.
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (!collapsible) return;
    try { if (localStorage.getItem(`cal-closed:${id}`) === '1') setOpen(false); } catch { /* privat läge */ }
  }, [id, collapsible]);
  const toggle = () => setOpen((o) => {
    try { localStorage.setItem(`cal-closed:${id}`, o ? '1' : '0'); } catch { /* privat läge */ }
    return !o;
  });
  const next = days.flatMap((d) => d.timed).find((e) => e.end! > now);
  // Säker även medan kalendern laddas (cal och days tomma).
  const todayCount = cal && days[0] && days[0].date === cal.days[0]?.date ? days[0].timed.filter((e) => e.end! > now).length : 0;
  const summary = !cal ? '' : next
    ? `${todayCount ? `Idag ${todayCount} · ` : ''}nästa ${dayOf(next.start!) === dayOf(now) ? '' : `${dayInfo(dayOf(next.start!), now).main.toLowerCase()} `}${hm(next.start!)} ${shortTitle(next.title)}`
    : `Inget inplanerat de närmaste ${ahead} dagarna`;

  return (
    <>
    <section aria-label={title} data-tint={compact ? 'skiffer' : 'plommon'} className={`flex min-h-0 w-full min-w-0 flex-col gap-3 surface overflow-hidden p-5 lg:max-h-none lg:p-6 ${compact ? 'max-h-[30rem]' : 'max-h-[44rem]'}`}>
      <h2 className="flex items-center gap-2.5 text-[1.125rem] font-semibold text-dim">
        {/* Rubriken fäller in och ut; "Månad" öppnar 30 dagar i en egen ruta. */}
        {collapsible ? (
          <button type="button" onClick={toggle} aria-expanded={open} aria-controls={`${id}-lista`}
            className="flex min-h-11 min-w-0 grow items-center gap-2.5 text-left">
            <Icon name="calendar" size={22} />
            <span className="truncate">{title}</span>
            <span aria-hidden="true" className={`text-[1rem] transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
          </button>
        ) : (
          <span className="flex min-h-11 min-w-0 grow items-center gap-2.5"><Icon name="calendar" size={22} /><span className="truncate">{title}</span></span>
        )}
        {cal && <button type="button" popoverTarget={id} className="min-h-11 shrink-0 text-[1rem] font-normal">Månad ›</button>}
      </h2>
      {!open && cal && <p className="truncate text-[1rem] text-dim">{summary}</p>}
      <div id={`${id}-lista`} hidden={!open} className="contents">
      {error ? (
        <p role="status" className="text-[1rem] text-dim">{error} Vi försöker igen om en stund.</p>
      ) : !cal ? (
        <p className="animate-pulse text-[1rem] text-dim">Hämtar kalendern …</p>
      ) : (
        <div className="scroll-x -mr-2 flex min-h-0 flex-col gap-4 overflow-y-auto pr-2">
          {days.length === 0 && <p className="text-[1rem] text-dim">Inget inplanerat de närmaste {ahead} dagarna</p>}
          {days.map((d, i) => {
            const timed = d.timed.filter((e) => e.end! > now || d.date !== cal.days[0].date);
            const info = dayInfo(d.date, now);
            const prev = i > 0 ? dayInfo(days[i - 1].date, now) : null;
            return (
              <Fragment key={d.date}>
                {prev && prev.week !== info.week && <WeekLine week={info.week} />}
                <Day info={info} count={timed.length + d.allDay.length}>
                  {d.allDay.map((e) => <AllDay key={e.id} e={e} />)}
                  {timed.slice(0, perDay).map((e) => <Row key={e.id} e={e} now={now} />)}
                  {timed.length > perDay && <p className="pl-[4.75rem] text-[0.875rem] font-semibold text-dim">+{timed.length - perDay} till</p>}
                </Day>
              </Fragment>
            );
          })}
        </div>
      )}
      </div>
    </section>
    {cal && (
      <div ref={week} id={id} popover="auto" className="m-auto max-h-[88dvh] w-[min(94vw,45rem)] surface overflow-hidden p-0 text-fg shadow-2xl backdrop:bg-black/60">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="flex items-center gap-2.5 text-[1.25rem] font-semibold"><Icon name="calendar" size={24} />{title === 'Kalender' ? 'Kommande 30 dagar' : `${title} · 30 dagar`}</h2>
          <button type="button" popoverTarget={id} popoverTargetAction="hide" className="pill">Stäng</button>
        </div>
        <div className="flex max-h-[calc(88dvh-4.5rem)] flex-col gap-4 overflow-y-auto px-5 py-4">
          {monthDays.length === 0 && <p className="py-3 text-[1rem] text-dim">Inget inplanerat</p>}
          {monthDays.map((d, i) => {
            const info = dayInfo(d.date, now);
            const prev = i > 0 ? dayInfo(monthDays[i - 1].date, now) : null;
            return (
              <Fragment key={d.date}>
                {prev && prev.week !== info.week && <WeekLine week={info.week} />}
                <Day info={info} count={d.timed.length + d.allDay.length}>
                  {d.allDay.map((e) => <AllDay key={e.id} e={e} />)}
                  {d.timed.map((e) => <Row key={e.id} e={e} now={now} />)}
                </Day>
              </Fragment>
            );
          })}
        </div>
      </div>
    )}
    </>
  );
}

/** Kalenderns färg som kant till vänster (bara när flera kalendrar slagits ihop). */
const bar = (e: CalEvent) => (e.src !== undefined ? { boxShadow: `inset 3px 0 0 ${CAL_COLORS[e.src % CAL_COLORS.length]}` } : undefined);

function Day({ info, count, children }: { info: DayInfo; count: number; children: React.ReactNode }) {
  return (
    <section className={`flex flex-col gap-1.5 ${info.free ? '-mx-2.5 rounded-[0.875rem] px-2.5 py-2' : ''}`} style={info.free ? { background: FREE_BG } : undefined}>
      <h3 className="flex items-baseline gap-2">
        <span className="text-[0.9375rem] font-bold" style={info.free ? { color: FREE_FG } : undefined}>{info.main}</span>
        <span className="text-[0.9375rem] text-dim">{info.sub}</span>
        {info.free && (
          <span className="self-center rounded-full px-2 py-0.5 text-[0.875rem] font-bold" style={{ color: FREE_FG, background: FREE_CHIP }}>
            {info.holiday ?? 'Helg'}
          </span>
        )}
        <span className="ml-auto text-[0.875rem] text-dim tabular-nums">{count}</span>
      </h3>
      {children}
    </section>
  );
}

function WeekLine({ week }: { week: number }) {
  return (
    <div className="flex items-center gap-2 text-[0.875rem] font-bold text-dim">
      <span>v. {week}</span><span className="h-px grow bg-line" />
    </div>
  );
}

function AllDay({ e }: { e: CalEvent }) {
  return (
    <p className="flex min-w-0 items-center gap-3 rounded-[0.75rem] py-1 pr-3 pl-3" style={bar(e)}>
      <span className="w-[3.25rem] shrink-0 text-[0.875rem] font-bold text-dim">Heldag</span>
      <span className="truncate text-[1rem]">{shortTitle(e.title)}</span>
    </p>
  );
}

function Row({ e, now }: { e: CalEvent; now: number }) {
  const live = isOngoing(e, now);
  const past = !live && e.end! <= now;
  const own = isOwnTeam(e.title);
  const loc = e.location?.split(',')[0];
  // Pågående: samma dova markering som aktiva knappar (t.ex. Auto På): ljus ram och svag fyllning (.sel), kalenderfärgen kvar till vänster.
  const edge = bar(e)?.boxShadow;
  const style = live ? { boxShadow: edge ? `${edge}, inset 0 0 0 1.5px rgb(230 237 243 / 0.5)` : undefined } : bar(e);
  return (
    <div className={`flex min-w-0 gap-3 rounded-[0.75rem] py-1.5 pr-3 pl-3 ${live ? 'sel' : ''} ${past ? 'text-dim' : ''}`}
      style={style}>
      <span className="flex w-[3.25rem] shrink-0 flex-col leading-tight tabular-nums">
        <span className="text-[1.0625rem] font-bold">{hm(e.start!)}</span>
        <span className="text-[0.875rem] text-dim">{hm(e.end!)}</span>
      </span>
      <span className="flex min-w-0 grow flex-col leading-tight">
        <span className={`line-clamp-2 text-[1.0625rem] break-words ${own ? 'font-bold' : 'font-semibold'}`}>{shortTitle(e.title)}</span>
        {loc && <span className="truncate text-[0.875rem] text-dim">{loc}</span>}
      </span>
      {live && <span className="shrink-0 self-center text-[0.875rem] font-bold">Pågår</span>}
    </div>
  );
}
