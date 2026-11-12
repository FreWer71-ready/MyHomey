import Link from 'next/link';
import { TrendArrow } from '@/components/TrendArrow';
import { LightControl } from '@/components/LightControl';
import { notFound } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { MoodButtons } from '@/components/MoodButtons';
import { SceneButtons } from '@/components/SceneButtons';
import { loadHome, loadHueScenes, loadNowPlaying, loadTv } from '@/lib/data';
import { TvRemote } from '@/components/TvRemote';
import { HueScenes } from '@/components/HueScenes';
import { fmtPercent, fmtTemp, heatTint, tint } from '@/lib/scale';

export const dynamic = 'force-dynamic';

export default async function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [home, hue, tv, np] = await Promise.all([loadHome(), loadHueScenes(), loadTv(), loadNowPlaying()]);
  // TV:n i det här rummet: fjärren visas alltid (även avstängd, så att den kan slås på).
  const roomTv = tv && tv.zone === id ? tv : null;
  const tvNow = roomTv?.cast ? np.find((p) => p.id === roomTv.cast!.id) : undefined;
  const isHome = id === home.rootZoneId;
  const room = home.rooms.find((r) => r.id === id);
  if (!room && !isHome) notFound();

  const tabs = [
    ...(home.rootZoneId && home.homeMoods.length ? [{ id: home.rootZoneId, name: 'Hela hemmet' }] : []),
    ...home.rooms.map((r) => ({ id: r.id, name: r.name })),
  ];
  const nav = (
    <nav aria-label="Rum" className="flex flex-wrap gap-2">
      {tabs.map((r) => (
        <Link
          key={r.id}
          href={`/rum/${r.id}`}
          aria-current={r.id === id ? 'page' : undefined}
          className={`flex min-h-11 items-center rounded-full px-4 font-extrabold ${r.id === id ? 'bg-sun text-ink' : 'glass'}`}
        >
          {r.name}
        </Link>
      ))}
    </nav>
  );

  if (!room) {
    return (
      <>
        {nav}
        <header className="flex items-center gap-4 rounded-[28px] px-6 py-5" style={{ background: tint('#8B5CF6', 0.42) }}>
          <span className="flex size-16 shrink-0 items-center justify-center rounded-[22px] bg-deep text-sun">
            <Icon name="logo" size={36} />
          </span>
          <div>
            <h1 className="text-[32px] leading-tight font-extrabold tracking-tight">Hela hemmet</h1>
            <p className="font-bold text-fg">{home.homeMoods.length} moods</p>
          </div>
        </header>
        <MoodButtons moods={home.homeMoods} />
      </>
    );
  }

  return (
    <>
      {nav}

      <header className="flex flex-wrap items-center gap-4 rounded-[28px] px-6 py-4" style={{ background: heatTint(room.temp) }}>
        <span className="flex size-16 shrink-0 items-center justify-center rounded-[22px] bg-deep text-sun">
          <Icon name={room.icon} size={36} />
        </span>
        <div className="grow">
          <h1 className="text-[32px] leading-tight font-extrabold tracking-tight">{room.name}</h1>
          <p className="font-bold text-fg">
            {room.deviceCount} enheter · {room.lights.length} lampor
          </p>
        </div>
        {room.temp != null && (
          <span className="flex items-center gap-2 rounded-3xl bg-glass-hi px-4 py-3">
            <Icon name="thermo" size={28} />
            <span className="text-4xl leading-none font-extrabold tracking-tight">{fmtTemp(room.temp)}<TrendArrow trend={room.tempTrend} /></span>
          </span>
        )}
        {room.humidity != null && (
          <span className="flex items-center gap-2 rounded-3xl bg-glass-hi px-4 py-3">
            <Icon name="drop" size={28} />
            <span className="text-4xl leading-none font-extrabold tracking-tight">{fmtPercent(room.humidity)}</span>
          </span>
        )}
        <span className="flex items-center gap-2 rounded-3xl bg-deep px-4 py-3 text-sun">
          <Icon name="bulb" size={28} />
          <span className="text-4xl leading-none font-extrabold tracking-tight">{room.lightsOn}</span>
        </span>
      </header>

      {room.moods.length > 0 && (
        <section aria-labelledby="moods" className="flex flex-col gap-2">
          <h2 id="moods" className="text-[22px] font-extrabold">Moods</h2>
          <MoodButtons moods={room.moods} />
        </section>
      )}

      {room.lights.length > 0 ? (
        <>
          <SceneButtons zoneId={room.id} room={room.name} size="large" />
          {/* Hue-scener för rummet (Hue-rum med samma namn som Homey-zonen). */}
          {process.env.CONTROL !== 'hue' && (() => {
            const own = hue.scenes.filter((s) => s.room?.trim().toLowerCase() === room.name.trim().toLowerCase());
            return own.length > 0 && (
              <details className="group rounded-[24px] border border-line bg-card">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-2 px-4 text-[20px] font-extrabold">
                  <span>
                    Hue-scener <span className="text-base font-bold text-dim">({own.length}{own.some((s) => s.active) ? ` · ${own.find((s) => s.active)!.name} på` : ''})</span>
                  </span>
                  <span className="text-dim transition-transform group-open:rotate-180">▾</span>
                </summary>
                <div className="px-3 pb-3">
                  <HueScenes scenes={own} />
                </div>
              </details>
            );
          })()}
          {roomTv && <TvRemote r={roomTv} title={tvNow ? [tvNow.title, tvNow.subtitle].filter(Boolean).join(' · ') : null} />}
          <h2 className="text-[22px] font-extrabold">Belysning</h2>
          <ul className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {room.lights.map((l) => (
              <LightControl key={l.id} light={l} />
            ))}
          </ul>
        </>
      ) : (
        <p className="rounded-3xl glass p-6 text-lg font-bold text-dim">Inga lampor i det här rummet.</p>
      )}
    </>
  );
}
