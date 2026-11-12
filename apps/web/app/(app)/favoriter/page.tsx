import { BASE_PATH } from '@/lib/paths';
import { Icon } from '@/components/Icon';
import { MoodButtons } from '@/components/MoodButtons';
import { loadFlows, loadHome, loadHueScenes } from '@/lib/data';
import { HueScenes } from '@/components/HueScenes';

export const dynamic = 'force-dynamic';

type Group = { name: string; moods: { id: string; name: string }[] };

/** Grupperar moods: Hela hemmet först, sedan rummen i bokstavsordning. */
function groupByRoom(moods: { id: string; name: string; room: string | null }[]): Group[] {
  const map = new Map<string, Group>();
  for (const m of moods) {
    const name = m.room ?? 'Hela hemmet';
    if (!map.has(name)) map.set(name, { name, moods: [] });
    map.get(name)!.moods.push({ id: m.id, name: m.name });
  }
  return [...map.values()].sort((a, b) =>
    a.name === 'Hela hemmet' ? -1 : b.name === 'Hela hemmet' ? 1 : a.name.localeCompare(b.name, 'sv'));
}

export default async function FavoritesPage({ searchParams }: { searchParams: Promise<{ hue?: string }> }) {
  const { hue: hueResult } = await searchParams;
  const [h, flows, hue] = await Promise.all([loadHome(), loadFlows(), loadHueScenes()]);
  const hueRooms = [...new Set(hue.scenes.map((s) => s.room ?? 'Övrigt'))].sort((a, b) => a.localeCompare(b, 'sv'));
  const hueMode = process.env.CONTROL === 'hue';
  const favorites = groupByRoom(hueMode
    ? [...h.homeMoods.map((m) => ({ ...m, room: null })), ...h.rooms.flatMap((r) => r.moods.map((m) => ({ ...m, room: r.name })))]
    : h.favoriteMoods);
  const all = groupByRoom([
    ...h.homeMoods.map((m) => ({ ...m, room: null })),
    ...h.rooms.flatMap((r) => r.moods.map((m) => ({ ...m, room: r.name }))),
  ]);

  return (
    <>
      <h1 className="flex items-center gap-3 text-[32px] leading-tight font-extrabold tracking-tight">
        <Icon name="star" size={32} /> Favoriter
      </h1>

      {/* Moods och flows i varsin kolumn på plattan så att båda syns utan scroll. */}
      <div className={`grid grid-cols-1 gap-4 lg:items-start ${hueMode ? '' : 'lg:grid-cols-2'}`}>
        <div className="flex flex-col gap-3">
          <h2 className="text-[13px] font-bold tracking-wider text-dim uppercase">{hueMode ? 'Scener' : 'Moods'}</h2>
          {favorites.length ? (
            favorites.map((g) => (
              <section key={g.name} className="flex flex-col gap-1.5">
                <h3 className="text-lg font-extrabold">{g.name}</h3>
                <MoodButtons moods={g.moods} large />
              </section>
            ))
          ) : (
            <p className="rounded-[20px] glass p-4 text-lg font-bold text-dim">
              {hueMode ? 'Inga scener än. Anslut Philips Hue nedan.' : 'Inga favoritmoods än. Markera moods som favoriter i Homey-appen så dyker de upp här.'}
            </p>
          )}
        </div>
        {!hueMode && <div className="flex flex-col gap-3">
          <h2 className="text-[13px] font-bold tracking-wider text-dim uppercase">Flows</h2>
          {flows.length ? (
            <MoodButtons moods={flows} kind="flow" large />
          ) : (
            <p className="rounded-[20px] glass p-4 text-lg font-bold text-dim">
              Inga favoritflows än. Markera flows som favoriter i Homey-appen så dyker de upp här.
            </p>
          )}
        </div>}
      </div>

      {/* Philips Hue: anslut en gång, sedan alla Hue-scener per rum. */}
      {hueResult === 'ok' && <p role="status" className="rounded-[16px] bg-ok-soft px-4 py-2 font-extrabold text-ok">Hue är anslutet.</p>}
      {hueResult === 'fel' && <p role="alert" className="rounded-[16px] bg-[rgb(240_80_60/0.2)] px-4 py-2 font-extrabold text-danger">Det gick inte att ansluta Hue. Försök igen.</p>}
      {hue.connected ? (
        !hueMode && hue.scenes.length > 0 && (
          <details className="group rounded-[24px] glass">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-2 px-4 text-lg font-extrabold">
              Hue-scener ({hue.scenes.length})
              <span className="text-dim transition-transform group-open:rotate-180">▾</span>
            </summary>
            <div className="flex flex-col gap-3 px-4 pb-4">
              {hueRooms.map((r) => (
                <section key={r} className="flex flex-col gap-2">
                  <h3 className="font-extrabold text-dim">{r}</h3>
                  <HueScenes scenes={hue.scenes.filter((s) => (s.room ?? 'Övrigt') === r)} />
                </section>
              ))}
            </div>
          </details>
        )
      ) : (
        <a href={`${BASE_PATH}/api/hue/login`} className="flex min-h-14 items-center justify-between gap-3 rounded-[24px] glass px-4 text-lg font-extrabold">
          Anslut Philips Hue för att använda Hue-scener
          <span className="rounded-full bg-sun px-4 py-1.5 text-ink">Anslut</span>
        </a>
      )}

      {!hueMode && all.length > 0 && (
        <details className="group rounded-[24px] glass">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-2 px-4 text-lg font-extrabold">
            Alla moods ({all.reduce((n, g) => n + g.moods.length, 0)})
            <span className="text-dim transition-transform group-open:rotate-180">▾</span>
          </summary>
          <div className="flex flex-col gap-3 px-4 pb-4">
            {all.map((g) => (
              <section key={g.name} className="flex flex-col gap-2">
                <h3 className="font-extrabold text-dim">{g.name}</h3>
                <MoodButtons moods={g.moods} />
              </section>
            ))}
          </div>
        </details>
      )}
    </>
  );
}
