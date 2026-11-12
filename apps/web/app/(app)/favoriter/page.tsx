import { Icon } from '@/components/Icon';
import { MoodButtons } from '@/components/MoodButtons';
import { loadFlows, loadHome } from '@/lib/data';

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

export default async function FavoritesPage() {
  const [h, flows] = await Promise.all([loadHome(), loadFlows()]);
  const favorites = groupByRoom(h.favoriteMoods);
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
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-3">
          <h2 className="text-[13px] font-bold tracking-wider text-dim uppercase">Moods</h2>
          {favorites.length ? (
            favorites.map((g) => (
              <section key={g.name} className="flex flex-col gap-1.5">
                <h3 className="text-lg font-extrabold">{g.name}</h3>
                <MoodButtons moods={g.moods} large />
              </section>
            ))
          ) : (
            <p className="rounded-[20px] glass p-4 text-lg font-bold text-dim">
              Inga favoritmoods än. Markera moods som favoriter i Homey-appen så dyker de upp här.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <h2 className="text-[13px] font-bold tracking-wider text-dim uppercase">Flows</h2>
          {flows.length ? (
            <MoodButtons moods={flows} kind="flow" large />
          ) : (
            <p className="rounded-[20px] glass p-4 text-lg font-bold text-dim">
              Inga favoritflows än. Markera flows som favoriter i Homey-appen så dyker de upp här.
            </p>
          )}
        </div>
      </div>

      {all.length > 0 && (
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
