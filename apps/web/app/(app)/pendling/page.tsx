import { notFound } from 'next/navigation';
import { Icon, type IconName } from '@/components/Icon';
import { loadCommute, loadLocate } from '@/lib/data';
import { goalEta, origin } from '@/lib/goal';
import { loadTransit, transitConfigured, transitGoal } from '@/lib/transit-source';
import { TransitTripCard } from '@/components/TransitTrip';
import { km } from '@/lib/trip';
import { etaConfigured } from '@/lib/route';
import { TONE_COLOR, direction, groupRoad, phrases, shortPlace, slip, type RoadEvent, type RoadStation, type Train } from '@/lib/commute';
import { PageTrainList } from '@/components/TrainFocus';
import { tint } from '@/lib/scale';
import { hhmm } from '@/lib/prices';

export const dynamic = 'force-dynamic';

const fmtDate = (ms: number) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', day: 'numeric', month: 'short', year: 'numeric' }).format(ms);

function Trains({ title, icon, list, active }: { title: string; icon: IconName; list: Train[]; active: boolean }) {
  return (
    // Högst 2/3 av skärmhöjden; listan skrollar inuti så att vägläget under alltid syns.
    <section className={`flex max-h-[66dvh] min-h-0 min-w-0 flex-col gap-2 rounded-[24px] glass p-3 ${active ? 'ring-2 ring-sun/60' : ''}`}>
      <h2 className="flex items-center gap-3 text-xl font-extrabold">
        <span className="flex size-10 items-center justify-center rounded-2xl bg-glass-hi"><Icon name={icon} size={24} /></span>
        {title}
      </h2>
      {list.length === 0 && <p className="rounded-2xl bg-glass-2 p-3 font-bold text-dim">Inga avgångar de närmaste 5 timmarna</p>}
      {/* Tåget som går inom 45 min visas stort med nedräkning. */}
      <div className="scroll-x -mr-1 min-h-0 overflow-y-auto pr-1"><PageTrainList trains={list} serverNow={Date.now()} /></div>
    </section>
  );
}

const deg = (v: number | null | undefined) => (v == null ? '–' : `${v.toLocaleString('sv-SE', { maximumFractionDigits: 1 })}°`);

/** Vägväderstationerna längs vägen: vägbana stort (färg efter halka), luft och nederbörd under. */
/** Väglagskamera vid VViS-stationen (samma id). Tidsstämpel per 5 min så att webbläsaren hämtar en färsk bild. */
const camUrl = (id: string, full = false) =>
  `https://api.trafikinfo.trafikverket.se/v2/Images/data/road.infrastructure.camera/RoadConditionCamera_VViS_${id}_K1.jpg?${full ? 'type=fullsize&' : ''}t=${Math.floor(Date.now() / 300_000)}`;

function Stations({ list }: { list: RoadStation[] }) {
  if (!list.length) return null;
  return (
    <ul className="grid grid-cols-2 gap-1.5 lg:grid-cols-4">
      {list.map((s) => {
        const tone = slip(s);
        return (
          <li key={s.id ?? s.name} className="rounded-2xl has-[[open]]:col-span-full" style={{ background: tone ? tint(TONE_COLOR[tone], 0.4) : undefined }}>
            <details className="group">
              {/* Tryck på temperaturen: Trafikverkets väglagskamera vid stationen. */}
              <summary className="flex cursor-pointer list-none flex-col px-3 py-2">
                <span className="truncate text-[13px] font-bold text-dim">{s.name}</span>
                <span className="flex items-center gap-1.5 text-[22px] leading-tight font-extrabold">
                  Väg {deg(s.road)}
                  {s.id && <Icon name="camera" size={16} className="opacity-60 group-open:opacity-100" />}
                </span>
                <span className="text-[13px] font-bold opacity-85">
                  Luft {deg(s.air)}{s.snow ? ' · snö' : s.rain ? ' · regn' : ''}{tone === 'bad' ? ' · halt' : tone === 'warn' ? ' · risk för halka' : ''}
                </span>
              </summary>
              {s.id && (
                <a href={camUrl(s.id, true)} target="_blank" rel="noopener noreferrer" className="block px-2 pb-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={camUrl(s.id)} alt={`Väglagskamera ${s.name}`} loading="lazy" className="w-full rounded-xl bg-glass-2" />
                  <span className="mt-1 block text-[12px] font-bold text-dim">Trafikverket · tryck för större bild</span>
                </a>
              )}
            </details>
          </li>
        );
      })}
    </ul>
  );
}

function Road({ list, stations }: { list: RoadEvent[]; stations: RoadStation[] }) {
  // Liknande ärenden (samma väg, typ och läge) visas som ett kort.
  const groups = groupRoad(list);
  return (
    <section className="flex flex-col gap-2 rounded-[24px] glass p-3">
      <h2 className="flex items-center gap-3 text-xl font-extrabold">
        <span className="flex size-10 items-center justify-center rounded-2xl bg-glass-hi"><Icon name="road" size={24} /></span>
        Bil Eskilstuna–Västerås
        <span className="rounded-full bg-glass-2 px-3 py-0.5 text-base text-dim">{groups.length}</span>
      </h2>
      <Stations list={stations} />
      {groups.length === 0 && <p className="rounded-2xl bg-ok-soft p-3 font-bold text-ok">Inga störningar på väg 56 eller E18</p>}
      <ul className="grid grid-cols-1 gap-1.5 lg:grid-cols-2">
        {groups.map((g) => {
          const places = [...new Set(g.places.map(shortPlace).filter(Boolean))];
          const facts = phrases(g.texts).filter((x) => x.toLowerCase() !== g.type.toLowerCase()).slice(0, 3);
          return (
            <li key={g.id} className="flex flex-col gap-1 rounded-2xl px-3 py-2" style={{ background: tint(TONE_COLOR[g.tone], 0.4) }} title={g.severityText ?? undefined}>
              {/* Rad 1: väg, typ, antal – period till höger. */}
              <span className="flex items-center gap-2">
                <span className="shrink-0 rounded-md bg-black/25 px-1.5 text-[13px] font-extrabold">{g.road}</span>
                <span className="min-w-0 grow truncate text-[17px] font-extrabold">
                  {g.type}{g.count > 1 && <span className="opacity-80"> ×{g.count}</span>}
                </span>
                <span className="shrink-0 text-[13px] font-bold opacity-80">
                  {g.start && g.start > Date.now() ? `från ${fmtDate(g.start)}` : g.end ? `t.o.m. ${fmtDate(g.end)}` : ''}
                </span>
              </span>
              {/* Rad 2: var. Rad 3: vad det innebär, som korta etiketter. */}
              {places.length > 0 && (
                <span className="truncate text-[15px] font-bold">{places.slice(0, 2).join(' · ')}{places.length > 2 ? ` +${places.length - 2}` : ''}</span>
              )}
              {facts.length > 0 && (
                <span className="flex flex-wrap gap-1">
                  {facts.map((f) => <span key={f} className="rounded-full bg-black/20 px-2 py-0.5 text-[12px] font-bold">{f}</span>)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default async function CommutePage() {
  if (process.env.COMMUTE === 'off') notFound();
  const [c, locate] = await Promise.all([loadCommute(), (etaConfigured() && process.env.DEFAULT_DESTINATION) || transitConfigured() ? loadLocate().catch(() => ({ members: [] })) : Promise.resolve({ members: [] })]);
  // Tid till standardmålet (DEFAULT_DESTINATION, t.ex. jobbet) med aktuell trafik, om det är inställt.
  const goal = etaConfigured() && process.env.DEFAULT_DESTINATION ? await goalEta(locate.members) : null;
  // Kollektivt till TRANSIT_DESTINATION (ResRobot): de två närmaste resorna härifrån eller hemifrån, om man inte redan är där.
  const tg = transitConfigured() ? transitGoal() : null;
  const o = origin(locate.members);
  const transit = tg && !(o.pos && km(o.pos, tg.at) <= 1) ? await loadTransit(o.from, tg.at, Date.now(), 2, !o.away) : [];
  const rtTrains = c ? [...c.out, ...c.home, ...c.all] : [];
  const dir = direction();
  // Alla avgångar de kommande 5 timmarna (räknat på förväntad tid).
  const soon = (list: Train[]) => list.filter((t) => (t.est ?? t.dep) <= Date.now() + 5 * 3600_000);
  return (
    <>
      <h1 className="flex items-baseline justify-between gap-3 text-2xl font-extrabold">
        {c && !c.trains ? 'Trafik' : 'Pendling'}
        {c && <span className="text-[13px] font-bold text-mute">Trafikverket · uppdaterad {hhmm(c.fetched)}</span>}
      </h1>
      {goal && (
        <section aria-label={`Tid till ${goal.label.toLowerCase()}`} className="flex items-center gap-3 rounded-2xl glass p-4">
          <Icon name="road" size={28} />
          <span className="flex min-w-0 grow flex-col leading-tight">
            <span className="text-[17px] font-bold">Tid till {goal.label.toLowerCase()}</span>
            <span className="truncate text-[14px] text-dim">
              Framme {hhmm(goal.eta.arrive)} om du åker nu · {Math.round(goal.eta.km)} km{goal.fromHere ? ' härifrån' : ''}
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end leading-tight">
            <span className="text-[28px] font-extrabold tabular-nums">{goal.eta.minutes} min</span>
            {goal.eta.trafficMin > 0 && <span className="text-[14px] font-bold" style={{ color: TONE_COLOR.warn }}>+{goal.eta.trafficMin} min trafik</span>}
          </span>
        </section>
      )}
      {tg && transit.length > 0 && (
        <section aria-label={`Resa till ${tg.label.toLowerCase()}`} className="flex flex-col gap-2">
          <h2 className="text-[18px] font-bold">Resa till {tg.label.toLowerCase()}{o.away ? ' · härifrån' : ''}</h2>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {transit.map((t, i) => <TransitTripCard key={t.dep} trip={t} trains={rtTrains} first={i === 0} />)}
          </div>
        </section>
      )}
      {!c ? (
        <p className="rounded-2xl glass p-4 font-bold text-dim">Trafikinformationen är inte tillgänglig just nu.</p>
      ) : (
        <>
          {c.trains && (
            <div className={`grid grid-cols-1 gap-3 lg:grid-cols-2 lg:items-start ${dir === 'home' ? '[&>*:first-child]:order-2' : ''}`}>
              <Trains title="Eskilstuna → Stockholm" icon="train" list={soon(c.out)} active={dir === 'out'} />
              <Trains title="Stockholm → Eskilstuna" icon="train" list={soon(c.home)} active={dir === 'home'} />
            </div>
          )}
          {/* Utan tågpendling (COMMUTE=road) är vägen viktigast: vägdata först, sedan tågen från Eskilstuna C. */}
          {!c.trains && <Road list={c.road} stations={c.stations ?? []} />}
          {(c.trains || c.all.length > 0) && <Trains title="Alla tåg från Eskilstuna C" icon="train" list={soon(c.all)} active={false} />}
          {c.trains && <Road list={c.road} stations={c.stations ?? []} />}
        </>
      )}
    </>
  );
}
