import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { SceneButtons } from '@/components/SceneButtons';
import { loadHome } from '@/lib/data';
import { fmtPercent, fmtTemp, heatColor } from '@/lib/scale';

export const dynamic = 'force-dynamic';

export default async function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const home = await loadHome();
  const room = home.rooms.find((r) => r.id === id);
  if (!room) notFound();

  return (
    <>
      <nav aria-label="Rum" className="flex flex-wrap gap-2">
        {home.rooms.map((r) => (
          <Link
            key={r.id}
            href={`/rum/${r.id}`}
            aria-current={r.id === room.id ? 'page' : undefined}
            className={`flex min-h-12 items-center rounded-full px-4.5 font-extrabold ${
              r.id === room.id ? 'bg-ink text-white' : 'bg-white'
            }`}
          >
            {r.name}
          </Link>
        ))}
      </nav>

      <header className="flex flex-wrap items-center gap-6 rounded-[32px] px-7 py-6" style={{ background: heatColor(room.temp) }}>
        <span className="flex size-21 shrink-0 items-center justify-center rounded-[26px] bg-ink text-sun">
          <Icon name={room.icon} size={44} />
        </span>
        <div className="grow">
          <h1 className="text-[44px] leading-tight font-extrabold tracking-tight">{room.name}</h1>
          <p className="text-[17px] font-bold text-[#3A3F5C]">
            {room.deviceCount} enheter · {room.lights.length} lampor
          </p>
        </div>
        <span className="flex items-center gap-2.5 rounded-3xl bg-white/60 px-5 py-3.5">
          <Icon name="thermo" size={32} />
          <span className="text-5xl leading-none font-extrabold tracking-tight">{fmtTemp(room.temp)}</span>
        </span>
        {room.humidity != null && (
          <span className="flex items-center gap-2.5 rounded-3xl bg-white/60 px-5 py-3.5">
            <Icon name="drop" size={32} />
            <span className="text-5xl leading-none font-extrabold tracking-tight">{fmtPercent(room.humidity)}</span>
          </span>
        )}
        <span className="flex items-center gap-2.5 rounded-3xl bg-ink px-5 py-3.5 text-sun">
          <Icon name="bulb" size={32} />
          <span className="text-5xl leading-none font-extrabold tracking-tight">{room.lightsOn}</span>
        </span>
      </header>

      <section aria-labelledby="moods" className="flex flex-col gap-3">
        <h2 id="moods" className="text-[26px] font-extrabold">Moods</h2>
        {room.moods.length > 0 ? (
          <ul className="flex flex-wrap gap-3">
            {room.moods.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  disabled
                  title="Kommer snart"
                  className="flex min-h-16 items-center gap-3 rounded-3xl bg-[#E3DAFF] px-6 text-xl font-extrabold text-ink disabled:cursor-not-allowed"
                >
                  <Icon name="moon" size={28} />
                  {m.name}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-3xl bg-white p-5 font-bold text-ink-2">Inga moods för det här rummet.</p>
        )}
      </section>

      {room.lights.length > 0 ? (
        <>
          <SceneButtons zoneId={room.id} room={room.name} size="large" />
          <h2 className="text-[26px] font-extrabold">Belysning</h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {room.lights.map((l) => (
              <li
                key={l.id}
                className={`flex min-h-25 items-center gap-3.5 rounded-3xl p-4 ${l.on ? 'bg-sun-soft' : 'bg-white'}`}
              >
                <span
                  className={`flex size-14 shrink-0 items-center justify-center rounded-[18px] ${
                    l.on ? 'bg-sun text-ink' : 'bg-[#E3E6EF] text-[#6A7090]'
                  }`}
                >
                  <Icon name="bulb" size={28} />
                </span>
                <span className="flex min-w-0 grow flex-col gap-2">
                  <span className="truncate text-[17px] font-extrabold">{l.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="flex h-2.5 grow overflow-hidden rounded-full bg-ink/12">
                      <span className="h-full rounded-full bg-ink" style={{ width: `${l.on ? (l.dim ?? 100) : 0}%` }} />
                    </span>
                    <span className="w-10 text-right text-sm font-extrabold">
                      {l.on ? (l.dim == null ? 'På' : `${l.dim} %`) : 'Av'}
                    </span>
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="rounded-3xl bg-white p-6 text-lg font-bold text-ink-2">Inga lampor i det här rummet.</p>
      )}
    </>
  );
}
