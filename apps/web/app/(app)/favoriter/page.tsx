import { BASE_PATH } from '@/lib/paths';
import { Icon } from '@/components/Icon';
import { ActionTiles, type Action } from '@/components/ActionTiles';
import { loadFlows, loadHome, loadHueScenes } from '@/lib/data';

export const dynamic = 'force-dynamic';

// Favoriter sorterade efter var och när: Rutiner (flows och hela hemmet) överst, sedan ett kort per rum
// med rummets moods och Hue-scener tillsammans. Alla moods finns bakom en länk.

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'sv');

export default async function FavoritesPage({ searchParams }: { searchParams: Promise<{ hue?: string }> }) {
  const { hue: hueResult } = await searchParams;
  const [h, flows, hue] = await Promise.all([loadHome(), loadFlows(), loadHueScenes()]);
  const hueMode = process.env.CONTROL === 'hue';

  // Hue-hushåll: alla scener (synkade som moods) räknas som favoriter. Homey: de markerade favoriterna.
  const favMoods = hueMode
    ? [...h.homeMoods.map((m) => ({ ...m, room: null })), ...h.rooms.flatMap((r) => r.moods.map((m) => ({ ...m, room: r.name })))]
    : h.favoriteMoods;

  const routines: Action[] = [
    ...flows.map((f) => ({ id: f.id, name: f.name, kind: 'flow' as const, advanced: f.advanced })),
    ...favMoods.filter((m) => !m.room).map((m) => ({ id: m.id, name: m.name, kind: 'mood' as const })),
  ].sort(byName);

  // Rum: favoritmoods + Hue-scener (Homey-hushåll med anslutet Hue) i samma kort.
  const rooms = new Map<string, Action[]>();
  const add = (room: string, a: Action) => rooms.set(room, [...(rooms.get(room) ?? []), a]);
  for (const m of favMoods.filter((x) => x.room)) add(m.room!, { id: m.id, name: m.name, kind: 'mood' });
  if (!hueMode) for (const s of hue.scenes) add(s.room ?? 'Övrigt', { id: s.id, name: s.name, kind: 'hue', dynamic: s.dynamic, active: s.active, colors: s.colors });
  const roomList = [...rooms.entries()].map(([name, items]) => ({ name, items: items.sort((a, b) => Number(a.kind === 'hue') - Number(b.kind === 'hue') || byName(a, b)) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'sv'));

  // Alla moods (även de som inte är favoriter), bakom en länk.
  const allMoods = [
    ...h.homeMoods.map((m) => ({ ...m, room: 'Hela hemmet' })),
    ...h.rooms.flatMap((r) => r.moods.map((m) => ({ ...m, room: r.name }))),
  ];
  const allRooms = [...new Set(allMoods.map((m) => m.room))];

  return (
    <>
      <header className="flex items-center justify-between gap-3">
        <h1 className="flex items-center gap-3 text-[32px] leading-tight font-bold tracking-tight">
          <Icon name="star" size={32} /> Favoriter
        </h1>
        {!hueMode && allMoods.length > 0 && (
          <button type="button" popoverTarget="alla-moods" className="pill">
            Alla moods ({allMoods.length}) ›
          </button>
        )}
      </header>

      {hueResult === 'ok' && <p role="status" className="rounded-[14px] bg-card px-4 py-2 text-[16px] font-semibold text-ok">Hue är anslutet.</p>}
      {hueResult === 'fel' && <p role="alert" className="rounded-[14px] bg-card px-4 py-2 text-[16px] font-semibold text-danger">Det gick inte att ansluta Hue. Försök igen.</p>}

      {routines.length > 0 && (
        <section className="flex flex-col gap-3 rounded-[20px] bg-card p-5 lg:p-6">
          <h2 className="flex items-center gap-2.5 text-[18px] font-semibold text-dim"><Icon name="home" size={22} />Rutiner</h2>
          <ActionTiles items={routines} layout="grid" />
        </section>
      )}

      {roomList.length > 0 ? (
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 lg:gap-6 xl:grid-cols-3">
          {roomList.map((r) => (
            <section key={r.name} className="flex flex-col gap-1 rounded-[20px] bg-card p-5 lg:p-6">
              <h2 className="text-[18px] font-semibold text-dim">{r.name}</h2>
              <ActionTiles items={r.items} />
            </section>
          ))}
        </div>
      ) : routines.length === 0 && (
        <p className="rounded-[20px] bg-card p-5 text-[17px] text-dim">
          {hueMode ? 'Inga scener än. Anslut Philips Hue nedan.' : 'Inga favoriter än. Markera moods och flows som favoriter i Homey-appen så dyker de upp här.'}
        </p>
      )}

      {!hue.connected && (
        <a href={`${BASE_PATH}/api/hue/login`} className="flex min-h-14 items-center justify-between gap-3 rounded-[20px] bg-card px-5 text-[17px] font-semibold">
          Anslut Philips Hue för att använda Hue-scener
          <span className="rounded-full bg-sun px-4 py-1.5 text-ink">Anslut</span>
        </a>
      )}

      {!hueMode && allMoods.length > 0 && (
        <div id="alla-moods" popover="auto" className="m-auto max-h-[88dvh] w-[min(94vw,820px)] overflow-hidden rounded-[20px] bg-card p-0 text-fg shadow-2xl backdrop:bg-black/60">
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
            <h2 className="text-[20px] font-semibold">Alla moods</h2>
            <button type="button" popoverTarget="alla-moods" popoverTargetAction="hide" className="pill">Stäng</button>
          </div>
          <div className="grid max-h-[calc(88dvh-72px)] grid-cols-1 gap-x-6 overflow-y-auto px-5 py-3 md:grid-cols-2">
            {allRooms.map((room) => (
              <section key={room} className="py-2">
                <h3 className="text-[16px] font-semibold text-dim">{room}</h3>
                <ActionTiles items={allMoods.filter((m) => m.room === room).map((m) => ({ id: m.id, name: m.name, kind: 'mood' as const }))} />
              </section>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
