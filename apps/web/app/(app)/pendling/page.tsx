import { notFound } from 'next/navigation';
import { Icon, type IconName } from '@/components/Icon';
import { loadCommute } from '@/lib/data';
import { TONE_COLOR, direction, groupRoad, trainStatus, trainTone, type RoadEvent, type Train } from '@/lib/commute';
import { tint } from '@/lib/scale';
import { hhmm } from '@/lib/prices';

export const dynamic = 'force-dynamic';

const fmtDate = (ms: number) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', day: 'numeric', month: 'short', year: 'numeric' }).format(ms);

function Trains({ title, icon, list, active }: { title: string; icon: IconName; list: Train[]; active: boolean }) {
  return (
    <section className={`flex min-w-0 flex-col gap-2 rounded-[24px] glass p-3 ${active ? 'ring-2 ring-sun/60' : ''}`}>
      <h2 className="flex items-center gap-3 text-xl font-extrabold">
        <span className="flex size-10 items-center justify-center rounded-2xl bg-glass-hi"><Icon name={icon} size={24} /></span>
        {title}
      </h2>
      {list.length === 0 && <p className="rounded-2xl bg-glass-2 p-3 font-bold text-dim">Inga avgångar de närmaste timmarna</p>}
      <ol className="flex flex-col gap-1.5">
        {list.map((t) => {
          const s = trainStatus(t);
          return (
            <li key={t.id} className="flex items-center gap-3 rounded-2xl px-3 py-2" style={{ background: tint(TONE_COLOR[trainTone(t)], 0.4) }}>
              <span className="flex w-[64px] shrink-0 flex-col leading-tight">
                <span className={`text-xl font-extrabold tabular-nums ${t.canceled || t.delay >= 3 ? 'line-through decoration-2 opacity-70' : ''}`}>{hhmm(t.dep)}</span>
                {!t.canceled && t.delay >= 3 && t.est && <span className="text-lg font-extrabold tabular-nums">{hhmm(t.est)}</span>}
              </span>
              <span className="flex min-w-0 grow flex-col leading-tight">
                <span className="truncate font-extrabold">
                  {t.dest}{t.arr && !t.canceled ? <span className="font-bold opacity-85"> · framme {hhmm(t.arr)}</span> : null}
                </span>
                <span className="truncate text-[14px] font-bold opacity-85">
                  {[t.product, `tåg ${t.ident}`, t.track && `spår ${t.track}`, ...t.notes].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[14px] font-extrabold ${s.cls}`}>{s.text}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Road({ list }: { list: RoadEvent[] }) {
  // Liknande ärenden (samma väg, typ och läge) visas som ett kort.
  const groups = groupRoad(list);
  return (
    <section className="flex flex-col gap-2 rounded-[24px] glass p-3">
      <h2 className="flex items-center gap-3 text-xl font-extrabold">
        <span className="flex size-10 items-center justify-center rounded-2xl bg-glass-hi"><Icon name="road" size={24} /></span>
        Bil Eskilstuna–Västerås
        <span className="rounded-full bg-glass-2 px-3 py-0.5 text-base text-dim">{list.length}</span>
      </h2>
      {groups.length === 0 && <p className="rounded-2xl bg-ok-soft p-3 font-bold text-ok">Inga störningar på väg 56 eller E18</p>}
      <ul className="grid grid-cols-1 gap-1.5 lg:grid-cols-2">
        {groups.map((g) => (
          <li key={g.id} className="flex flex-col rounded-2xl px-3 py-2 leading-tight" style={{ background: tint(TONE_COLOR[g.tone], 0.4) }}>
            <span className="font-extrabold">
              <span className="mr-1.5 rounded-md bg-black/20 px-1.5 text-[13px]">{g.road}</span>
              {g.type}{g.count > 1 ? ` · ${g.count} st` : ''}
              {g.severityText ? <span className="font-bold opacity-80"> · {g.severityText.toLowerCase()}</span> : null}
            </span>
            {g.places.length > 0 && <span className="line-clamp-2 text-[14px] font-bold opacity-85">{g.places.slice(0, 2).join(' · ')}{g.places.length > 2 ? ` + ${g.places.length - 2} till` : ''}</span>}
            {g.texts.length > 0 && <span className="truncate text-[14px] font-bold opacity-85">{g.texts.slice(0, 3).join(' · ')}</span>}
            {g.start && g.start > Date.now()
              ? <span className="text-[13px] font-bold opacity-80">Startar {fmtDate(g.start)}</span>
              : g.end && <span className="text-[13px] font-bold opacity-80">Pågår till {fmtDate(g.end)}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function CommutePage() {
  if (process.env.COMMUTE === 'off') notFound();
  const c = await loadCommute();
  const dir = direction();
  return (
    <>
      <h1 className="flex items-baseline justify-between gap-3 text-2xl font-extrabold">
        Pendling
        {c && <span className="text-[13px] font-bold text-mute">Trafikverket · uppdaterad {hhmm(c.fetched)}</span>}
      </h1>
      {!c ? (
        <p className="rounded-2xl glass p-4 font-bold text-dim">Trafikinformationen är inte tillgänglig just nu.</p>
      ) : (
        <>
          <div className={`grid grid-cols-1 gap-3 lg:grid-cols-2 ${dir === 'home' ? '[&>*:first-child]:order-2' : ''}`}>
            <Trains title="Eskilstuna → Stockholm" icon="train" list={c.out} active={dir === 'out'} />
            <Trains title="Stockholm → Eskilstuna" icon="train" list={c.home} active={dir === 'home'} />
          </div>
          <Road list={c.road} />
        </>
      )}
    </>
  );
}
