import { notFound } from 'next/navigation';
import { Icon, type IconName } from '@/components/Icon';
import { loadCommute, loadLocate, PLACE } from '@/lib/data';
import { goalEta, origin } from '@/lib/goal';
import { loadOnward, loadTransit, transitConfigured, transitGoal } from '@/lib/transit-source';
import { allPositions, earliestAt, freshestPosition, inferTrain, pickRun, positionDevices, TERMINALS } from '@/lib/onboard';
import { detectTrain, loadConfirmed, positionHistory } from '@/lib/onboard-source';
import { TransitTripCard } from '@/components/TransitTrip';
import type { TransitLeg } from '@/lib/transit';
import { RoadImpact } from '@/components/RoadImpact';
import { km } from '@/lib/trip';
import { etaConfigured } from '@/lib/route';
import { TONE_COLOR, direction, groupRoad, phrases, shortPlace, slip, type RoadEvent, type RoadStation, type Train } from '@/lib/commute';
import { PageTrainList, RiddenTrain } from '@/components/TrainFocus';
import { UnskipButton } from '@/components/OnTrainButton';
import { TripFromHere } from '@/components/TripFromHere';
import { saveTrip, settleTrips } from '@/lib/trips-source';
import { tint } from '@/lib/scale';
import { hhmm } from '@/lib/prices';

export const dynamic = 'force-dynamic';

const fmtDate = (ms: number) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', day: 'numeric', month: 'short', year: 'numeric' }).format(ms);

function Trains({ title, icon, list, active, journey }: { title: string; icon: IconName; list: Train[]; active: boolean; journey?: 'out' | 'home' }) {
  return (
    // Högst 2/3 av skärmhöjden; listan skrollar inuti så att vägläget under alltid syns.
    <section className={`flex max-h-[66dvh] min-h-0 min-w-0 flex-col gap-2 rounded-[1.5rem] glass p-3 ${active ? 'ring-2 ring-sun/60' : ''}`}>
      <h2 className="flex items-center gap-3 text-xl font-extrabold">
        <span className="flex size-10 items-center justify-center rounded-2xl bg-glass-hi"><Icon name={icon} size={24} /></span>
        {title}
      </h2>
      {list.length === 0 && <p className="rounded-2xl bg-glass-2 p-3 font-bold text-dim">Inga avgångar de närmaste 5 timmarna</p>}
      {/* Tåget som går inom 45 min visas stort med nedräkning. */}
      <div className="scroll-x -mr-1 min-h-0 overflow-y-auto pr-1"><PageTrainList trains={list} serverNow={Date.now()} journey={journey} /></div>
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
                <span className="truncate text-[0.875rem] font-bold text-dim">{s.name}</span>
                <span className="flex items-center gap-1.5 text-[1.375rem] leading-tight font-extrabold">
                  Väg {deg(s.road)}
                  {s.id && <Icon name="camera" size={16} className="opacity-60 group-open:opacity-100" />}
                </span>
                <span className="text-[0.875rem] font-bold opacity-85">
                  Luft {deg(s.air)}{s.snow ? ' · snö' : s.rain ? ' · regn' : ''}{tone === 'bad' ? ' · halt' : tone === 'warn' ? ' · risk för halka' : ''}
                </span>
              </summary>
              {s.id && (
                <a href={camUrl(s.id, true)} target="_blank" rel="noopener noreferrer" className="block px-2 pb-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={camUrl(s.id)} alt={`Väglagskamera ${s.name}`} loading="lazy" className="w-full rounded-xl bg-glass-2" />
                  <span className="mt-1 block text-[0.875rem] font-bold text-dim">Trafikverket · tryck för större bild</span>
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
    <section className="flex flex-col gap-2 rounded-[1.5rem] glass p-3">
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
              {/* Radbryts när det är trångt (mobil, stort läge) i stället för att typen trycks ihop till en bokstav per rad. */}
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="shrink-0 rounded-md bg-black/25 px-1.5 text-[0.875rem] font-extrabold">{g.road}</span>
                <span className="min-w-[7rem] grow truncate text-[1.0625rem] font-extrabold">
                  {g.type}{g.count > 1 && <span className="opacity-80"> ×{g.count}</span>}
                </span>
                <RoadImpact tone={g.tone} plain className="rounded-md bg-black/35 px-1.5 text-[0.875rem]" />
                <span className="shrink-0 text-[0.875rem] font-bold opacity-80">
                  {g.start && g.start > Date.now() ? `från ${fmtDate(g.start)}` : g.end ? `t.o.m. ${fmtDate(g.end)}` : ''}
                </span>
              </span>
              {/* Rad 2: var. Rad 3: vad det innebär, som korta etiketter. */}
              {places.length > 0 && (
                <span className="truncate text-[0.9375rem] font-bold">{places.slice(0, 2).join(' · ')}{places.length > 2 ? ` +${places.length - 2}` : ''}</span>
              )}
              {facts.length > 0 && (
                <span className="flex flex-wrap gap-1">
                  {facts.map((f) => <span key={f} className="rounded-full bg-black/20 px-2 py-0.5 text-[0.875rem] font-bold">{f}</span>)}
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
  const [c, locate] = await Promise.all([loadCommute(), (etaConfigured() && process.env.DEFAULT_DESTINATION) || transitConfigured() ? loadLocate().catch(() => ({ members: [], items: [] })) : Promise.resolve({ members: [], items: [] })]);
  // Tid till standardmålet (DEFAULT_DESTINATION, t.ex. jobbet) med aktuell trafik, om det är inställt.
  const goal = etaConfigured() && process.env.DEFAULT_DESTINATION ? await goalEta(locate.members) : null;
  // Kollektivt till TRANSIT_DESTINATION (ResRobot): de två närmaste resorna härifrån eller hemifrån, om man inte redan är där.
  const tg = transitConfigured() ? transitGoal() : null;
  const o = origin(locate.members);
  // Eftermiddag (riktning hem): hem från positionen, annars från jobbet. Annars till jobbet om man inte redan är där.
  const goingHome = !!tg && direction() === 'home' && (o.away || !o.pos);
  // Efter kl 12 bara hemresan (om man inte redan är hemma); före kl 12 bara resan till jobbet (om man inte redan är där).
  // Dörr till dörr per tåg (ResRobot vid tryck) när föredragen väg finns; två förslag härifrån bara när man är någon
  // annanstans än hemma eller på jobbet.
  const perTrain = !!tg && !!process.env.TRANSIT_VIA && !!process.env.TRANSIT_TRANSFER;
  const elsewhere = o.away && !(o.pos && km(o.pos, tg?.at ?? PLACE) <= 1);
  const transit = !tg || (perTrain && !elsewhere) ? []
    : direction() === 'home' ? (goingHome ? await loadTransit(o.away ? o.pos! : tg.at, PLACE, Date.now(), 2, false, true) : [])
    : !(o.pos && km(o.pos, tg.at) <= 1) ? await loadTransit(o.from, tg.at, Date.now(), 2, !o.away) : [];
  const rtTrains = c ? [...c.out, ...c.home, ...c.all] : [];
  // Tågläge: på ett tåg i pendlingen visas bara det tåget och resten av resan.
  const me = process.env.HOUSEHOLD ?? '', nowMs = Date.now(), d0 = direction();
  const dirTrains = c ? [...c[d0], ...(c.recent?.[d0] ?? [])] : [];
  // Avslutade resor får sin faktiska ankomst (sparas för statistiken under Historik → Tåg).
  if (c?.trains) await settleTrips(nowMs);
  const confirmed = c?.trains ? await loadConfirmed(nowMs) : null;
  let onTrain = confirmed ? { train: confirmed.ident, dist: 0, src: 'user' as const } : c?.trains ? await detectTrain(freshestPosition(locate.members, locate.items, me), nowMs, new Set(dirTrains.map((t) => t.ident))) : null;
  // Ingen ny position sedan perrongen strax före en avgång: troligen på det tåget.
  const guessed = !onTrain && c?.trains ? inferTrain([...allPositions(locate.members, locate.items, me, nowMs, 2 * 3600_000), ...await positionHistory(positionDevices(locate.members, locate.items, me), nowMs - 2 * 3600_000)], TERMINALS[d0 === 'out' ? 0 : 1], dirTrains, nowMs) : null;
  if (guessed) onTrain = { train: guessed, dist: 0, src: 'life360' };
  const pool = [...rtTrains, ...(c?.recent?.out ?? []), ...(c?.recent?.home ?? [])];
  const run = confirmed ? pool.find((t) => t.ident === confirmed.ident && t.dep === confirmed.dep) ?? pickRun(pool, confirmed.ident, nowMs)
    : onTrain ? pickRun(pool, onTrain.train, nowMs) : null;
  const toWork = !!run && [...(c?.out ?? []), ...(c?.recent?.out ?? [])].some((t) => t.id === run.id);
  const rArr = run?.arr != null ? run.arr + (run.delay ?? 0) * 60_000 : null;
  const onward = run && rArr && (toWork || [...(c?.home ?? []), ...(c?.recent?.home ?? [])].some((t) => t.id === run.id)) ? await loadOnward(rArr, toWork, PLACE) : [];
  const tripLegs: TransitLeg[] = run && rArr ? [{
    kind: 'train', from: toWork ? 'Eskilstuna C' : 'Stockholm C', to: toWork ? 'Stockholm C' : 'Eskilstuna C',
    dep: run.est ?? run.dep, arr: rArr, minutes: Math.round((rArr - (run.est ?? run.dep)) / 60_000),
    label: `${run.product ?? 'Tåg'} ${run.ident}`, num: run.ident, dir: run.dest, track: null,
  }, ...onward] : [];
  const arrived = rArr != null && nowMs > rArr;
  const homeRun = !!run && [...(c?.home ?? []), ...(c?.recent?.home ?? [])].some((t) => t.id === run.id);
  // Framme (positionen vid jobbet eller hemma): tillbaka till normalläget.
  const here = freshestPosition(locate.members, locate.items, me, nowMs);
  const goalAt = toWork ? transitGoal()?.at : PLACE;
  const atGoal = !!here && !!goalAt && km(here.at, goalAt) < 0.4;
  const ridden = run && !atGoal && (!arrived || (onward.length > 0 && nowMs <= onward.at(-1)!.arr + 5 * 60_000)) ? run : null;
  if (ridden && !confirmed && (toWork || homeRun)) await saveTrip(ridden, toWork, guessed ? 'guess' : 'gps');
  const dir = direction();
  // Alla avgångar de kommande 5 timmarna (räknat på förväntad tid).
  const soon = (list: Train[]) => list.filter((t) => (t.est ?? t.dep) <= Date.now() + 5 * 3600_000);
  // Aktuell riktning: tåg man inte hinner till härifrån (taxi/cykel) visas inte – då håller inte planen.
  const reachBy = earliestAt(freshestPosition(locate.members, locate.items, me), TERMINALS[d0 === 'out' ? 0 : 1], nowMs);
  const reach = (list: Train[]) => soon(list).filter((t) => reachBy == null || (t.est ?? t.dep) >= reachBy);
  return (
    <>
      <h1 className="flex items-baseline justify-between gap-3 text-2xl font-extrabold">
        {c && !c.trains ? 'Trafik' : 'Pendling'}
        <span className="flex items-center gap-3">
          {c?.skipped ? <UnskipButton count={c.skipped} /> : null}
          {c && <span className="text-[0.875rem] font-bold text-mute">Trafikverket · uppdaterad {hhmm(c.fetched)}</span>}
        </span>
      </h1>
      {!ridden && (transitConfigured() || etaConfigured()) && (
        <TripFromHere defaultTo={dir === 'out' ? 'work' : 'home'} workLabel={tg?.label ?? process.env.DEFAULT_DESTINATION_LABEL ?? 'Jobbet'} transit={transitConfigured()} car={etaConfigured()} />
      )}
      {ridden && (
        <section aria-label="Tåget du är på" className="flex flex-col gap-3">
          {onward.length > 0 && (
            <TransitTripCard trip={{ dep: tripLegs[0].dep, arr: tripLegs.at(-1)!.arr, legs: tripLegs, startAt: null, endAt: null }} trains={rtTrains} first home={!toWork} ongoing />
          )}
          {!arrived && <section className="flex flex-col gap-2 rounded-[1.5rem] glass p-3 ring-2 ring-sun/60">
            <h2 className="text-xl font-extrabold">Du är {guessed ? 'troligen ' : ''}på tåget</h2>
            <RiddenTrain t={ridden} guessed={!!guessed} confirmed={!!confirmed} />
          </section>}
          {/* Om tågläget har fel: avgångarna i aktuell riktning inom en timme (minst nästa). */}
          {c && !arrived && (() => {
            const list = (d0 === 'out' ? c.out : c.home).filter((t) => t.ident !== ridden.ident && (t.est ?? t.dep) > nowMs);
            const hour = list.filter((t) => (t.est ?? t.dep) <= nowMs + 3600_000);
            const show = hour.length ? hour : list.slice(0, 1);
            return show.length > 0 && <Trains title="Inte på det tåget? Nästa avgångar" icon="train" list={show} active={false} journey={perTrain ? d0 : undefined} />;
          })()}
        </section>
      )}
      {!ridden && goal && (
        // ETA först och störst; restid, avstånd och trafik mindre under (ljusgrå #C5CDD6 klarar 4,5:1 även mot ljus bild).
        <section aria-label={goal.home ? 'Tid hem' : `Tid till ${goal.label.toLowerCase()}`} className="flex items-center gap-4 rounded-2xl glass px-4 py-3">
          <Icon name="road" size={32} />
          {/* Skärmläsare får en mening; den visuella uppdelningen göms för dem. */}
          <span className="sr-only">
            {goal.home ? 'Hem' : `Till ${goal.label.toLowerCase()}`}: {goal.home ? 'hemma' : 'framme'} klockan {hhmm(goal.eta.arrive)} om du åker nu,
            {' '}{goal.eta.minutes} {goal.eta.minutes === 1 ? 'minut' : 'minuter'}, {Math.round(goal.eta.km)} kilometer{goal.eta.trafficMin > 0 ? `, varav ${goal.eta.trafficMin} ${goal.eta.trafficMin === 1 ? 'minut' : 'minuter'} trafik` : ''}.
          </span>
          <span aria-hidden="true" className="flex min-w-0 grow flex-col gap-0.5">
            <span className="text-[1rem] font-semibold text-[#C5CDD6] first-letter:uppercase">
              {goal.driving ? 'Du kör · ' : ''}{goal.home ? 'hem' : `till ${goal.label.toLowerCase()}`}{goal.driving ? '' : ' · om du åker nu'}
            </span>
            <span className="flex items-baseline gap-2 leading-none">
              <span className="text-[1.125rem] font-semibold">{goal.home ? 'Hemma' : 'Framme'}</span>
              <span className="text-[2.5rem] font-extrabold tabular-nums">{hhmm(goal.eta.arrive)}</span>
            </span>
            <span className="text-[1rem] text-[#C5CDD6]">
              {goal.eta.minutes} min · {Math.round(goal.eta.km)} km{goal.fromHere ? ' härifrån' : ''}
              {goal.eta.trafficMin > 0 && <span className="font-bold" style={{ color: TONE_COLOR.warn }}> · +{goal.eta.trafficMin} min trafik</span>}
            </span>
          </span>
        </section>
      )}
      {!ridden && tg && transit.length > 0 && (
        <section aria-label={goingHome ? 'Resa hem' : `Resa till ${tg.label.toLowerCase()}`} className="flex flex-col gap-2">
          <h2 className="text-[1.125rem] font-bold">{goingHome ? 'Resa hem' : `Resa till ${tg.label.toLowerCase()}`}{o.away ? ' · härifrån' : ''}</h2>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {transit.map((t, i) => <TransitTripCard key={t.dep} trip={t} trains={rtTrains} first={i === 0} home={goingHome} />)}
          </div>
        </section>
      )}
      {ridden ? null : !c ? (
        <p className="rounded-2xl glass p-4 font-bold text-dim">Trafikinformationen är inte tillgänglig just nu.</p>
      ) : (
        // Stor skärm: tåg och väg i två kolumner (ingen skroll); mobil: under varandra.
        <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
          <div className="flex min-w-0 flex-col gap-4">
            {/* Bara aktuell riktning: mot Stockholm före kl 12, hem efter. */}
            {c.trains && (dir === 'out'
              ? <Trains title="Eskilstuna → Stockholm" icon="train" list={reach(c.out)} active journey={perTrain ? 'out' : undefined} />
              : <Trains title="Stockholm → Eskilstuna" icon="train" list={reach(c.home)} active journey={perTrain ? 'home' : undefined} />)}
            {c.trains && dir === 'out' && <Trains title="Alla tåg från Eskilstuna C" icon="train" list={soon(c.all)} active={false} />}
            {/* Utan tågpendling (COMMUTE=road) är vägen viktigast: vägdata först. */}
            {!c.trains && <Road list={c.road} stations={c.stations ?? []} />}
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            {c.trains && <Road list={c.road} stations={c.stations ?? []} />}
            {/* I bilen (Life360): bara vägläget, inga tåg. */}
            {!c.trains && c.all.length > 0 && !goal?.driving && <Trains title="Alla tåg från Eskilstuna C" icon="train" list={soon(c.all)} active={false} />}
          </div>
        </div>
      )}
    </>
  );
}
