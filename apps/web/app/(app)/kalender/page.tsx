import { Icon } from '@/components/Icon';
import { ScrollToToday } from '@/components/ScrollToToday';
import { calendarConfigured, loadCalendarServer } from '@/lib/calendar-source';
import { loadMirrorServer, mirrorConfigured } from '@/lib/calendar-mirror';
import { loadSchoolCalendars, skolschemaConfigured } from '@/lib/skolschema-source';
import {
  CAL_COLORS, FREE_BG, FREE_CHIP, FREE_FG, TZ, addDays, dayInfo, dayOf, isOngoing, monthsWindow, shortTitle,
  type CalDay, type Calendar,
} from '@/lib/calendar-view';

export const dynamic = 'force-dynamic';

// Kalender: Ulrikas och Fredriks händelser i kolumner bredvid varandra, en rad per datum så att dagarna går att jämföra.
// Innevarande och nästa månad. Helg och röda dagar markeras som i kalenderkortet på Hem. Egen kalender + den speglade (CALENDAR_MIRROR_*).
// Barnens skolscheman (SKOLSCHEMA, t.ex. Wilmer) kommer som egna kolumner mellan Ulrika (vänster) och Fredrik (höger): en rad "Skola" per skoldag.

const hm = (ms: number) => new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(ms);
const monthName = (date: string) => {
  const s = new Intl.DateTimeFormat('sv-SE', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(Date.parse(`${date}T12:00:00Z`));
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const weekdayShort = (date: string) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'UTC', weekday: 'short' }).format(Date.parse(`${date}T12:00:00Z`)).replace('.', '');
const RING = 'inset 0 0 0 1.5px rgb(230 237 243 / 0.5)';

/** `narrow`: fyra kolumner eller fler på mobil, då står tiden över titeln så att titlarna får hela kolumnens bredd. */
function Events({ day, now, narrow = false }: { day?: CalDay; now: number; narrow?: boolean }) {
  if (!day || day.allDay.length + day.timed.length === 0) return <div />;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {day.allDay.map((e) => (
        <p key={e.id} className="truncate rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[0.75rem] font-semibold text-dim">Heldag · {shortTitle(e.title)}</p>
      ))}
      {day.timed.map((e) => {
        const live = isOngoing(e, now);
        const past = !live && e.end! <= now;
        const edge = e.src !== undefined ? `inset 3px 0 0 ${CAL_COLORS[e.src % CAL_COLORS.length]}` : undefined;
        const shadow = live ? (edge ? `${edge}, ${RING}` : undefined) : edge;
        // "Möten på jobbet" (id jobb@datum) och "Skola" (id skola@datum) är sammanslagna: första startar, sista slutar, plus antal.
        const school = e.id.startsWith('skola@');
        const work = e.id.startsWith('jobb@') || school;
        return (
          <div key={e.id} title={work ? `${shortTitle(e.title)}: första ${hm(e.start!)}, sista ${hm(e.end!)}${e.location ? ` (${e.location})` : ''}` : [shortTitle(e.title), e.location?.split(',')[0]].filter(Boolean).join(' · ')}
            className={`flex min-w-0 gap-1.5 rounded-[0.5rem] py-0.5 pr-1.5 pl-2 ${narrow && !school ? 'max-md:flex-col max-md:gap-0' : ''} ${live ? 'sel' : ''} ${past ? 'text-dim' : ''}`}
            style={shadow ? { boxShadow: shadow } : undefined}>
            <span className={`flex w-[2.4rem] shrink-0 flex-col leading-snug tabular-nums ${narrow && !school ? 'max-md:w-auto' : ''}`}>
              <span className="text-[0.8125rem] font-bold">{hm(e.start!)}</span>
              {work && <span className="text-[0.75rem] text-dim">{hm(e.end!)}</span>}
              {/* Skola: smal kolumn på mobil (flera barn), så antal lektioner står under tiderna; ordet "Skola" först från bredare skärm. */}
              {school && e.location && <span className="text-[0.6875rem] text-dim md:hidden">{e.location.replace('lektioner', 'lekt.')}</span>}
            </span>
            <span className={`min-w-0 flex-col leading-snug ${school ? 'hidden md:flex' : 'flex'}`}>
              <span className="text-[0.875rem] break-words hyphens-auto">{shortTitle(e.title)}</span>
              {work && e.location && <span className="text-[0.75rem] text-dim">{e.location}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default async function CalendarPage() {
  const now = Date.now();
  const w = monthsWindow(now);
  const ownName = process.env.HOUSEHOLD === 'ulrika' ? 'Ulrika' : 'Fredrik';
  const otherName = ownName === 'Ulrika' ? 'Fredrik' : 'Ulrika';
  // undefined = ingen kalender kopplad (kolumnen visas inte), null = kopplad men gick inte att hämta.
  const [own, other, schools] = await Promise.all([
    calendarConfigured() ? loadCalendarServer({ back: w.back, days: w.ahead }).catch(() => null) : Promise.resolve(undefined),
    mirrorConfigured() ? loadMirrorServer(true) : Promise.resolve(undefined),
    skolschemaConfigured() ? loadSchoolCalendars() : Promise.resolve([]),
  ]);
  const byDate = (cal: Calendar | null) => new Map((cal?.days ?? []).map((d) => [d.date, d]));
  const people: { name: string; cal: Calendar | null; days: Map<string, CalDay> }[] = ([{ name: ownName, cal: own }, { name: otherName, cal: other }] as { name: string; cal: Calendar | null | undefined }[])
    .filter((c): c is { name: string; cal: Calendar | null } => c.cal !== undefined)
    .sort((a, b) => Number(a.name !== 'Ulrika') - Number(b.name !== 'Ulrika')) // Ulrika till vänster, Fredrik till höger, i båda dashboards
    .map((c) => ({ ...c, days: byDate(c.cal) }));
  const kids = schools.map((c) => ({ ...c, days: byDate(c.cal) }));
  // Ulrika längst till vänster, Fredrik längst till höger, barnens scheman däremellan.
  const cols = [...people.filter((c) => c.name === 'Ulrika'), ...kids, ...people.filter((c) => c.name !== 'Ulrika')];

  if (!cols.length) return <p className="rounded-[1.25rem] bg-card p-5 text-[1.0625rem] text-dim">Ingen kalender är kopplad.</p>;

  const today = dayOf(now);
  // Barnens skolkolumner är smalare än Ulrikas och Fredriks (de visar bara tider); fyra kolumner eller fler på mobil ger stapling i Events.
  const narrow = cols.length >= 4;
  // Stort läge (AA, data-mode="stor"): med tre kolumner eller fler fyller alla utom den sista (Fredrik) bredden, och den sista ligger till
  // höger utanför skärmen (tabellen får en egen scrollruta, rubrikraden följer med). Övriga lägen oförändrade.
  const focus = cols.length >= 3;
  const tplBig = `2.5rem repeat(${cols.length}, minmax(0, 1fr))`; // stort läge: lika breda kolumner, så att alla utom den sista fyller bredden exakt
  const tpl = `2.5rem ${cols.map((c) => (kids.includes(c as (typeof kids)[number]) ? 'minmax(0, 1fr)' : 'minmax(0, 1.7fr)')).join(' ')}`;
  const dates: string[] = [];
  for (let d = w.start; d <= w.end; d = addDays(d, 1)) dates.push(d);
  const failed = people.filter((c) => !c.cal).map((c) => `${c.name}s`);
  const failedKids = kids.filter((c) => !c.cal).map((c) => `${c.name}s`);

  return (
    <>
      <ScrollToToday />
      <h1 className="flex items-center gap-3 text-[2rem] leading-tight font-bold tracking-tight"><Icon name="calendar" size={32} /> Kalender</h1>
      {failed.length > 0 && <p role="status" className="text-[1rem] text-dim">{failed.join(' och ')} kalender kunde inte hämtas just nu.</p>}
      {failedKids.length > 0 && <p role="status" className="text-[1rem] text-dim">{failedKids.join(' och ')} schema kunde inte hämtas just nu (skolan kan ha låst det).</p>}

      <div className={focus ? 'big:max-h-[calc(100dvh-6rem)] big:overflow-auto' : undefined}>
      <div className={focus ? 'big:w-(--kal-w)' : undefined} style={{ '--tpl': tpl, '--tpl-big': focus ? tplBig : tpl, ...(focus ? { '--kal-w': `calc((100% - 2.5rem) * ${cols.length} / ${cols.length - 1} + 2.5rem)` } : {}) } as React.CSSProperties}>
      {/* Kolumnrubriker följer med när man scrollar. */}
      <div className="sticky top-0 z-10 -mx-3 grid gap-x-2 border-b border-line bg-ground px-3 py-2 [grid-template-columns:var(--tpl)] big:[grid-template-columns:var(--tpl-big)] md:-mx-4 md:px-4" aria-hidden="true">
        <span />
        {cols.map((c) => <span key={c.name} className={`truncate text-[1.0625rem] font-bold ${narrow ? 'max-md:text-[0.9375rem]' : ''}`}>{c.name}</span>)}
      </div>

      <div className="flex flex-col">
        {dates.map((date) => {
          const info = dayInfo(date, now);
          const isToday = date === today;
          const monday = new Date(`${date}T12:00:00Z`).getUTCDay() === 1;
          return (
            <section key={date} aria-label={`${info.main} ${info.sub}`}>
              {date.endsWith('-01') && <h2 className="pt-5 pb-1 text-[1.25rem] font-bold">{monthName(date)}</h2>}
              {(monday || date === w.start) && <p className="pt-2 pb-0.5 text-[0.75rem] font-semibold text-dim">Vecka {info.week}</p>}
              <div id={isToday ? 'idag' : undefined}
                className={`scroll-mt-12 rounded-[0.75rem] border-b border-line px-1 py-1.5 ${date < today ? 'opacity-70' : ''}`}
                style={{ background: info.free ? FREE_BG : undefined, boxShadow: isToday ? 'inset 0 0 0 1.5px rgb(245 181 68 / 0.6)' : undefined }}>
                {info.holiday && (
                  <p className="mb-1 inline-block rounded-full px-2.5 py-0.5 text-[0.75rem] font-bold" style={{ background: FREE_CHIP, color: FREE_FG }}>{info.holiday}</p>
                )}
                <div className="grid items-start gap-x-2 [grid-template-columns:var(--tpl)] big:[grid-template-columns:var(--tpl-big)]">
                  {/* Stort läge: datumet ligger kvar till vänster när man skrollar åt höger till den sista kolumnen. */}
                  <div className={`flex flex-col leading-tight ${focus ? 'big:sticky big:left-0 big:z-[1] big:rounded-md big:bg-black/45 big:backdrop-blur-sm' : ''}`} style={info.free ? { color: FREE_FG } : undefined}>
                    <span className={`text-[0.6875rem] font-semibold uppercase ${info.free ? '' : 'text-dim'}`}>{weekdayShort(date)}</span>
                    <span className={`text-[1.125rem] font-bold tabular-nums ${isToday ? 'text-sun' : ''}`}>{Number(date.slice(8))}</span>
                  </div>
                  {cols.map((c) => <Events key={c.name} day={c.days.get(date)} now={now} narrow={narrow} />)}
                </div>
              </div>
            </section>
          );
        })}
      </div>
      </div>
      </div>
    </>
  );
}
