import { BASE_PATH } from '@/lib/paths';
import { Icon } from '@/components/Icon';
import { ActionTiles, type Action } from '@/components/ActionTiles';
import { SceneButtons } from '@/components/SceneButtons';
import { LightControl } from '@/components/LightControl';
import { TvRemote } from '@/components/TvRemote';
import { TrendArrow } from '@/components/TrendArrow';
import { loadFlows, loadHome, loadHueScenes, loadNowPlaying, loadTv } from '@/lib/data';
import { fmtTemp } from '@/lib/scale';
import { sameRoom } from '@/lib/home';

export const dynamic = 'force-dynamic';

// Favoriter och rum på en sida: Rutiner (flows och hela hemmet) överst, sedan ett kort per rum med
// Ljust/Mys/Släck och rummets favoriter. Övriga scener, TV och lampor fälls ut under kortet vid tryck.

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'sv');

export default async function FavoritesPage({ searchParams }: { searchParams: Promise<{ hue?: string }> }) {
  const { hue: hueResult } = await searchParams;
  const [h, flows, hue, tv, np] = await Promise.all([loadHome(), loadFlows(), loadHueScenes(), loadTv(), loadNowPlaying()]);
  const hueMode = process.env.CONTROL === 'hue';

  // Hue-hushåll: alla scener (synkade som moods) räknas som favoriter. Homey: de markerade favoriterna.
  const favMoods = hueMode
    ? [...h.homeMoods.map((m) => ({ ...m, room: null })), ...h.rooms.flatMap((r) => r.moods.map((m) => ({ ...m, room: r.name })))]
    : h.favoriteMoods;

  const routines: Action[] = [
    ...flows.map((f) => ({ id: f.id, name: f.name, kind: 'flow' as const, advanced: f.advanced })),
    ...favMoods.filter((m) => !m.room).map((m) => ({ id: m.id, name: m.name, kind: 'mood' as const })),
  ].sort(byName);

  // Rumskorten visas som murverk (CSS-kolumner): de staplas tätt under varandra oavsett längd.
  // Rum: favoritmoods + Hue-scener (Homey-hushåll med anslutet Hue) i samma kort.
  const rooms = new Map<string, Action[]>();
  const add = (room: string, a: Action) => rooms.set(room, [...(rooms.get(room) ?? []), a]);
  for (const m of favMoods.filter((x) => x.room)) add(m.room!, { id: m.id, name: m.name, kind: 'mood' });
  if (!hueMode) for (const s of hue.scenes) add(s.room ?? 'Övrigt', { id: s.id, name: s.name, kind: 'hue', dynamic: s.dynamic, active: s.active, colors: s.colors });
  const roomList = [...rooms.entries()].map(([name, items]) => ({ name, items: items.sort((a, b) => Number(a.kind === 'hue') - Number(b.kind === 'hue') || byName(a, b)) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'sv'));

  // Ett kort per rum: favoriterna synliga, rummets övriga scener i Detaljer.
  const cards = h.rooms.map((room) => {
    const favs = roomList.filter((x) => sameRoom(x.name, room.name)).flatMap((x) => x.items);
    const all: Action[] = [
      ...room.moods.map((m) => ({ id: m.id, name: m.name, kind: 'mood' as const })),
      ...(!hueMode ? hue.scenes.filter((x) => sameRoom(x.room, room.name))
        .map((x) => ({ id: x.id, name: x.name, kind: 'hue' as const, dynamic: x.dynamic, active: x.active, colors: x.colors })) : []),
    ];
    const more = all.filter((a) => !favs.some((f) => f.kind === a.kind && f.id === a.id)).sort(byName);
    return { room, favs, more, tv: tv && tv.zone === room.id ? tv : null };
  }).filter((c) => c.room.lights.length > 0 || c.favs.length > 0 || c.more.length > 0 || c.tv);

  // Favoriter i rum som inte finns som zon (t.ex. Hue-rum med annat namn): egna enkla kort.
  const orphans = roomList.filter((x) => !h.rooms.some((r) => sameRoom(x.name, r.name)));

  // Alla moods (även de som inte är favoriter), bakom en länk.
  const allMoods = [
    ...h.homeMoods.map((m) => ({ ...m, room: 'Hela hemmet' })),
    ...h.rooms.flatMap((r) => r.moods.map((m) => ({ ...m, room: r.name }))),
  ];
  const allRooms = [...new Set(allMoods.map((m) => m.room))];

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-3 text-[2rem] leading-tight font-bold tracking-tight">
          <Icon name="star" size={32} /> Favoriter
        </h1>
        {!hueMode && allMoods.length > 0 && (
          <button type="button" popoverTarget="alla-moods" className="pill">
            Alla moods ({allMoods.length}) ›
          </button>
        )}
      </header>

      {hueResult === 'ok' && <p role="status" className="rounded-[0.875rem] bg-card px-4 py-2 text-[1rem] font-semibold text-ok">Hue är anslutet.</p>}
      {hueResult === 'fel' && <p role="alert" className="rounded-[0.875rem] bg-card px-4 py-2 text-[1rem] font-semibold text-danger">Det gick inte att ansluta Hue. Försök igen.</p>}

      {routines.length > 0 && (
        <section className="flex flex-col gap-3 rounded-[1.25rem] bg-card p-5 lg:p-6">
          <h2 className="flex items-center gap-2.5 text-[1.125rem] font-semibold text-dim"><Icon name="home" size={22} />Rutiner</h2>
          <ActionTiles items={routines} cols={2} />
        </section>
      )}

      {cards.length + orphans.length > 0 ? (
        <section aria-label="Rum" className="grid items-start gap-4 md:grid-cols-2 lg:gap-6 xl:grid-cols-3">
          {cards.map(({ room: r, favs, more, tv: rtv }) => (
            <section key={r.id} aria-labelledby={`rum-${r.id}`} className="flex flex-col gap-3 rounded-[1.25rem] bg-card p-4 lg:p-5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-[0.75rem] bg-white/[0.06]"><Icon name={r.icon} size={22} /></span>
                <h2 id={`rum-${r.id}`} className="min-w-[7rem] grow truncate text-[1.1875rem] font-bold">{r.name}</h2>
                {r.temp != null && <span className="shrink-0 text-[1.125rem] font-semibold tabular-nums">{fmtTemp(r.temp)}<TrendArrow trend={r.tempTrend} /></span>}
                {r.lights.length > 0 && (
                  <span className={`flex shrink-0 items-center gap-1 rounded-full bg-white/[0.08] px-2.5 py-1 text-[0.9375rem] font-semibold ${r.lightsOn ? 'text-sun' : 'text-dim'}`}>
                    <Icon name="bulb" size={16} />{r.lightsOn}/{r.lights.length}<span className="sr-only"> lampor tända</span>
                  </span>
                )}
              </div>
              {r.lights.length > 0 && <SceneButtons zoneId={r.id} room={r.name} size="card" />}
              {/* Minimerat som standard: fakta och Ljust/Mys/Släck. Favoriter, scener, TV och lampor under Detaljer. */}
              {(favs.length > 0 || more.length > 0 || r.lights.length > 0 || rtv) && (
                <details className="group border-t border-line pt-1">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-[1rem] font-semibold text-dim [&::-webkit-details-marker]:hidden">
                    Detaljer
                    <span aria-hidden="true" className="text-[1.25rem] transition-transform group-open:rotate-90">›</span>
                  </summary>
                  <div className="flex flex-col gap-3 pt-2">
                    {favs.length + more.length > 0 && <ActionTiles items={[...favs, ...more]} layout="compact" />}
                    {rtv && <TvRemote r={rtv} title={(() => { const p = rtv.cast ? np.find((x) => x.id === rtv.cast!.id) : undefined; return p ? [p.title, p.subtitle].filter(Boolean).join(' · ') : null; })()} />}
                    {r.lights.length > 0 && (
                      <ul className="flex flex-col gap-3">
                        {r.lights.map((l) => <LightControl key={l.id} light={l} />)}
                      </ul>
                    )}
                  </div>
                </details>
              )}
            </section>
          ))}
          {orphans.map((r) => (
            <section key={r.name} aria-labelledby={`rum-x-${r.name}`} className="flex flex-col gap-3 rounded-[1.25rem] bg-card p-4 lg:p-5">
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-[0.75rem] bg-white/[0.06]"><Icon name="bulb" size={22} /></span>
                <h2 id={`rum-x-${r.name}`} className="min-w-0 grow truncate text-[1.1875rem] font-bold">{r.name}</h2>
                <span className="shrink-0 text-[0.9375rem] text-dim">{r.items.length} scener</span>
              </div>
              <details className="group border-t border-line pt-1">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-[1rem] font-semibold text-dim [&::-webkit-details-marker]:hidden">
                  Detaljer
                  <span aria-hidden="true" className="text-[1.25rem] transition-transform group-open:rotate-90">›</span>
                </summary>
                <div className="pt-2"><ActionTiles items={r.items} layout="compact" /></div>
              </details>
            </section>
          ))}
        </section>
      ) : routines.length === 0 && (
        <p className="rounded-[1.25rem] bg-card p-5 text-[1.0625rem] text-dim">
          {hueMode ? 'Inga scener än. Anslut Philips Hue nedan.' : 'Inga favoriter än. Markera moods och flows som favoriter i Homey-appen så dyker de upp här.'}
        </p>
      )}

      {!hue.connected && (
        <a href={`${BASE_PATH}/api/hue/login`} className="flex min-h-14 items-center justify-between gap-3 rounded-[1.25rem] bg-card px-5 text-[1.0625rem] font-semibold">
          Anslut Philips Hue för att använda Hue-scener
          <span className="rounded-full bg-sun px-4 py-1.5 text-ink">Anslut</span>
        </a>
      )}

      {!hueMode && allMoods.length > 0 && (
        <div id="alla-moods" popover="auto" className="m-auto max-h-[88dvh] w-[min(94vw,51.25rem)] overflow-hidden rounded-[1.25rem] bg-card p-0 text-fg shadow-2xl backdrop:bg-black/60">
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
            <h2 className="text-[1.25rem] font-semibold">Alla moods</h2>
            <button type="button" popoverTarget="alla-moods" popoverTargetAction="hide" className="pill">Stäng</button>
          </div>
          <div className="grid max-h-[calc(88dvh-4.5rem)] grid-cols-1 gap-x-6 overflow-y-auto px-5 py-3 md:grid-cols-2">
            {allRooms.map((room) => (
              <section key={room} className="py-2">
                <h3 className="text-[1rem] font-semibold text-dim">{room}</h3>
                <ActionTiles items={allMoods.filter((m) => m.room === room).map((m) => ({ id: m.id, name: m.name, kind: 'mood' as const }))} />
              </section>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
